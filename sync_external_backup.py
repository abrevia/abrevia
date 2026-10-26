import shutil
import os

src_dir = r"C:\Users\Personal\Desktop\abrevia"
backup_dir = r"D:\02 PROJECTS\abrevia"

os.makedirs(backup_dir, exist_ok=True)

# Copy everything except node_modules, .vercel, archive_legacy, and .git
ignore_patterns = shutil.ignore_patterns("node_modules", ".vercel", ".git", "archive_legacy")

for item in os.listdir(src_dir):
    s = os.path.join(src_dir, item)
    d = os.path.join(backup_dir, item)
    if item in ["node_modules", ".vercel", ".git", "archive_legacy"]:
        continue
    if os.path.isdir(s):
        if os.path.exists(d):
            shutil.rmtree(d)
        shutil.copytree(s, d, ignore=ignore_patterns)
    else:
        shutil.copy2(s, d)

print(f"[OK] Successfully backed up Abrevia 1 to external HD: {backup_dir}")
print("Backup contents:")
for root, dirs, files in os.walk(backup_dir):
    rel = os.path.relpath(root, backup_dir)
    if rel == ".":
        for f in files:
            print(f" - {f}")
    else:
        for f in files:
            print(f" - {os.path.join(rel, f)}")
