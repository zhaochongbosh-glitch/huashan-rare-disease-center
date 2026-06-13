import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "publications.json"
SEARCH_STRATEGY = '"Huashan Rare Disease Center"[Affiliation] OR "Huashan Rare Disease Centre"[Affiliation]'
QUERY_AFFILIATIONS = ["Huashan Rare Disease Center", "Huashan Rare Disease Centre"]
BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


def fetch_json(endpoint, params):
    url = f"{BASE}/{endpoint}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as response:
      return json.loads(response.read().decode("utf-8"))


def fetch_xml(endpoint, params):
    url = f"{BASE}/{endpoint}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as response:
      return ET.fromstring(response.read())


def text_content(element):
    if element is None:
        return ""
    return " ".join("".join(element.itertext()).split())


def article_date(article):
    journal_issue = article.find("./MedlineCitation/Article/Journal/JournalIssue/PubDate")
    if journal_issue is None:
        return ""

    year = text_content(journal_issue.find("Year"))
    month = text_content(journal_issue.find("Month"))
    day = text_content(journal_issue.find("Day"))
    medline_date = text_content(journal_issue.find("MedlineDate"))

    if year:
        parts = [year]
        if month:
            parts.append(month)
        if day:
            parts.append(day)
        return " ".join(parts)
    return medline_date


def author_name(author):
    collective = text_content(author.find("CollectiveName"))
    if collective:
        return collective

    last = text_content(author.find("LastName"))
    fore = text_content(author.find("ForeName"))
    initials = text_content(author.find("Initials"))
    if last and fore:
        return f"{fore} {last}"
    if last and initials:
        return f"{initials} {last}"
    return last or fore or initials


def author_affiliations(author):
    affiliations = []
    for affiliation in author.findall("./AffiliationInfo/Affiliation"):
        value = text_content(affiliation)
        if value and value not in affiliations:
            affiliations.append(value)
    return affiliations


def matching_affiliations(affiliations):
    matches = []
    for affiliation in affiliations:
        normalized = affiliation.lower()
        if any(target.lower() in normalized for target in QUERY_AFFILIATIONS):
            matches.append(affiliation)
    return matches


def article_ids(article):
    ids = {}
    for item in article.findall("./PubmedData/ArticleIdList/ArticleId"):
        id_type = item.attrib.get("IdType", "")
        value = text_content(item)
        if id_type and value:
            ids[id_type] = value
    return ids


def parse_article(article):
    pmid = text_content(article.find("./MedlineCitation/PMID"))
    title = text_content(article.find("./MedlineCitation/Article/ArticleTitle"))
    journal = text_content(article.find("./MedlineCitation/Article/Journal/Title"))
    abstract_parts = [
        text_content(part)
        for part in article.findall("./MedlineCitation/Article/Abstract/AbstractText")
    ]
    abstract = "\n".join(part for part in abstract_parts if part)

    authors = []
    all_affiliations = []
    huashan_affiliations = []
    for author in article.findall("./MedlineCitation/Article/AuthorList/Author"):
        affiliations = author_affiliations(author)
        all_affiliations.extend(affiliations)
        huashan_affiliations.extend(matching_affiliations(affiliations))
        name = author_name(author)
        if name:
            authors.append({"name": name, "affiliations": affiliations})

    unique_affiliations = list(dict.fromkeys(all_affiliations))
    unique_huashan = list(dict.fromkeys(huashan_affiliations))
    ids = article_ids(article)

    return {
        "pmid": pmid,
        "title": title,
        "authors": authors,
        "authorLine": ", ".join(author["name"] for author in authors[:12]) + (" et al." if len(authors) > 12 else ""),
        "affiliations": unique_affiliations,
        "matchedAffiliations": unique_huashan,
        "journal": journal,
        "publicationDate": article_date(article),
        "doi": ids.get("doi", ""),
        "pubmedUrl": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else "",
        "abstract": abstract,
        "abstractZh": "",
        "translationStatus": "pending-openai-api"
    }


def main():
    search = fetch_json(
        "esearch.fcgi",
        {
            "db": "pubmed",
            "term": SEARCH_STRATEGY,
            "retmode": "json",
            "retmax": 10000,
            "sort": "pub_date"
        },
    )
    ids = search["esearchresult"].get("idlist", [])
    items = []

    for start in range(0, len(ids), 100):
        batch = ids[start:start + 100]
        root = fetch_xml(
            "efetch.fcgi",
            {
                "db": "pubmed",
                "id": ",".join(batch),
                "retmode": "xml"
            },
        )
        items.extend(parse_article(article) for article in root.findall("./PubmedArticle"))
        time.sleep(0.34)

    items.sort(key=lambda item: int(item["pmid"] or 0), reverse=True)
    payload = {
        "metadata": {
            "source": "PubMed",
            "sourceUrl": "https://pubmed.ncbi.nlm.nih.gov/",
            "searchStrategy": SEARCH_STRATEGY,
            "queryAffiliations": QUERY_AFFILIATIONS,
            "total": len(items),
            "updatedAt": date.today().isoformat(),
            "translationStatus": "pending-openai-api",
            "notes": "abstractZh is reserved for later OpenAI API translation."
        },
        "items": items
    }

    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"publications={len(items)} output={OUTPUT}")


if __name__ == "__main__":
    main()
