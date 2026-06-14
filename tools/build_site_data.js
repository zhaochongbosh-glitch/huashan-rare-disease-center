const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const sources = {
  diseases: "data/diseases.json",
  diseaseDetails: "data/disease-details.json",
  mdtDirectory: "data/mdt-directory.json",
  pediatricScope: "data/pediatric-scope.json",
  floorplans: "data/floorplans.json",
  publications: "data/publications.json"
};

const data = {};

for (const [key, relativePath] of Object.entries(sources)) {
  const fullPath = path.join(root, relativePath);
  data[key] = JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

const output = `window.SiteData = ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync(path.join(root, "data/site-data.js"), output, "utf8");

console.log(`siteDataKeys=${Object.keys(data).join(",")}`);
