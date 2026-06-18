const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "about.html",
  "visit.html",
  "team.html",
  "mdt.html",
  "diseases.html",
  "disease-detail.html",
  "research.html",
  "publications.html",
  "policy.html",
  "news.html",
  "news-detail.html",
  "contact.html",
  "governance.html",
  "styles.css",
  "scripts.js"
];

const directories = ["assets", "data"];

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(dist, file));
  }
}

for (const directory of directories) {
  const source = path.join(root, directory);
  const target = path.join(dist, directory);
  if (fs.existsSync(source)) {
    copyDirectory(source, target);
  }
}

console.log(`vercelDist=${dist}`);
