const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const targetFile = path.join(__dirname, 'data', 'copy.csv');
const targetDir = path.dirname(targetFile);

// Ensure data directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`Created directory: ${targetDir}`);
}

// Create a default CSV template if it doesn't exist
if (!fs.existsSync(targetFile)) {
  const defaultCsv = `Key,Draft,Approved,Character Limit,Context
landing.hero.title,"Build beautiful user experiences","Collaborative copy design, simplified.","40","Hero Title"
landing.hero.subtitle,"This is a draft subtitle to verify it fits in your layout.","Figma CopyFlow connects copywriters directly with design layers.","100","Hero Subtitle"
landing.hero.cta,"Try it","Get started for free","25","Hero CTA"
`;
  fs.writeFileSync(targetFile, defaultCsv, 'utf8');
  console.log(`Created template copy.csv at: ${targetFile}`);
}

console.log(`\n🔍 CopyFlow Watcher active!`);
console.log(`Watching for changes to: ${targetFile}`);
console.log(`Every time this file is replaced or edited, it will be auto-committed and pushed to GitHub.\n`);

let debounceTimer;
fs.watchFile(targetFile, { interval: 1000 }, (curr, prev) => {
  if (curr.mtimeMs === prev.mtimeMs) return;

  console.log(`[${new Date().toLocaleTimeString()}] Detected change in copy.csv...`);
  clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(() => {
    autoGitCommitAndPush();
  }, 1000);
});

function autoGitCommitAndPush() {
  console.log("Staging, committing, and pushing copy.csv to GitHub...");
  
  // Navigate to root git folder and push data/copy.csv
  const rootGitDir = path.dirname(__dirname); // parent directory (cole-jetski-experiments)
  const relativeFilePath = path.join('CopyFlow', 'data', 'copy.csv');
  
  const gitCmd = `git add "${relativeFilePath}" && git commit -m "chore(copyflow): auto-sync updated copy.csv" && git push`;
  
  exec(gitCmd, { cwd: rootGitDir }, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Git Sync Failed: ${error.message}`);
      return;
    }
    if (stdout) console.log(`Git stdout:\n${stdout.trim()}`);
    if (stderr && stderr.includes('heading')) console.warn(`Git info:\n${stderr.trim()}`);
    console.log("✅ Successfully synced copy.csv to GitHub!");
  });
}
