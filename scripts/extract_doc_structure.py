"""Parse doc text into per-lesson structured content."""
import re
import json
import sys
import io

# Force UTF-8 output to bypass cp1252 errors on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = r'C:\Users\devpl\AppData\Local\Temp\lesson_doc_text.txt'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()
lines = text.split('\n')

img_count = 0
current_lesson = None
current_topic = None
structures = {}

for ln in lines:
    s = ln.strip()
    for m in re.finditer(r'@@IMGMARKER(\d+)@@', s):
        img_count = int(m.group(1))

    # Strip leading [H#] heading-level prefix, if any
    s_clean = re.sub(r'^\[H\d\]\s*', '', s)
    m = re.match(r'Lesson\s+(\d+):\s*(.+)', s_clean)
    if m:
        num = int(m.group(1))
        current_lesson = num
        current_topic = None
        structures.setdefault(num, [])
        continue
    if re.match(r'Aralin\s+(\d+):', s_clean):
        current_lesson = None
        current_topic = None
        continue

    if current_lesson is None:
        continue

    m = re.match(r'Topic\s+(\d+)[:.]?\s*(.+)', s_clean)
    if m:
        title = s_clean.strip()
        current_topic = {'topic': title, 'paragraphs': [], 'images': []}
        structures[current_lesson].append(current_topic)
        continue

    if current_topic is None:
        current_topic = {'topic': '__preface__', 'paragraphs': [], 'images': []}
        structures[current_lesson].append(current_topic)

    for m in re.finditer(r'@@IMGMARKER(\d+)@@', s):
        current_topic['images'].append(int(m.group(1)))
    plain = re.sub(r'@@IMGMARKER\d+@@', '', s).strip()
    if plain and not plain.startswith('[H'):
        current_topic['paragraphs'].append(plain)

out_path = r'C:\Users\devpl\AppData\Local\Temp\doc_structured.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(structures, f, ensure_ascii=False, indent=1)

for n in sorted(structures.keys()):
    if n < 2 or n > 7:
        continue
    topics = structures[n]
    total_img = sum(len(t['images']) for t in topics)
    print(f'\n=== Lesson {n} ({len(topics)} topics, {total_img} images) ===')
    for t in topics:
        title = t['topic'][:65]
        nimg = len(t['images'])
        npar = len(t['paragraphs'])
        firstpar = t['paragraphs'][0][:70] if t['paragraphs'] else ''
        print(f'  {nimg:2d}img {npar:3d}p  {title:65s}  | {firstpar}')
