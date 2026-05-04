"""Full rebuild of lessons 2-7: rewrite text from doc, rebuild image sections with renamed webps + layouts."""
import json, os, sys, time, shutil, re, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'c:\Users\devpl\Desktop\modulearn - deploy'
folder = os.path.join(ROOT, 'lesson images webp')
uploads = os.path.join(ROOT, 'backend', 'uploads', 'lessons')

with open(os.path.join(folder, '_rename_log.json'), 'r', encoding='utf-8') as f:
    log = json.load(f)

# Build mapping: doc_idx -> chosen filename (prefer crop, then exact, then approx)
def pick_best(entries):
    rank = {'crop': 0, 'exact': 1, 'dup': 2, 'crop_approx': 3, 'approx': 4}
    return sorted(entries, key=lambda x: (rank.get(x.get('kind', 'exact'), 5), -x.get('corr', 0) if 'corr' in x else 0, x.get('d', 999)))[0]

per_idx = {}
for p in log['plan']:
    didx = p.get('doc_idx')
    if not didx: continue
    per_idx.setdefault(didx, []).append(p)
mapping = {idx: pick_best(entries)['new'] for idx, entries in per_idx.items()}

# Load doc structure
with open(r'C:\Users\devpl\AppData\Local\Temp\doc_structured.json', 'r', encoding='utf-8') as f:
    doc_struct = json.load(f)


_next_id = int(time.time() * 1000)
def new_id():
    global _next_id
    _next_id += 1
    return _next_id


def html_escape(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def make_image_section(layout, images_data, side_texts=None, caption='', title=''):
    s = {
        'id': new_id(),
        'file': None,
        'type': 'image',
        'order': 0,
        'title': title,
        'images': [{'url': i['url'], 'file': None, 'fileName': i['fileName'], 'caption': i.get('caption', '')} for i in images_data],
        'layout': layout,
        'caption': caption,
        'content': images_data[0]['url'] if images_data else '',
        'fileName': images_data[0]['fileName'] if images_data else None,
    }
    if layout in ('text-left', 'text-right'):
        s['sideTexts'] = side_texts or ['']
        s['layerImages'] = [[{'url': i['url'], 'file': None, 'fileName': i['fileName'], 'caption': i.get('caption', '')}] for i in images_data]
    return s


def make_paragraph_section(html, content_layout='text'):
    return {
        'id': new_id(),
        'file': None,
        'type': 'paragraph',
        'order': 0,
        'title': '',
        'caption': '',
        'content': html,
        'fileName': None,
        'contentLayout': content_layout,
    }


def img_for(didx, caption=''):
    if didx not in mapping:
        return None
    fn = mapping[didx]
    return {'url': f'/uploads/lessons/{fn}', 'fileName': fn, 'caption': caption}


def copy_assets(needed_doc_ids):
    os.makedirs(uploads, exist_ok=True)
    for d in needed_doc_ids:
        if d not in mapping: continue
        src = os.path.join(folder, mapping[d])
        dst = os.path.join(uploads, mapping[d])
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy2(src, dst)


def slug_lower(s, n=60):
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()[:n]


def paragraphs_to_html(paragraphs, max_paragraphs=None):
    """Convert a list of plain text paragraphs into clean HTML, joining bullet-y lines."""
    out = []
    bullets = []
    def flush_bullets():
        if bullets:
            out.append('<ul style="list-style-type: disc;">' + ''.join(f'<li>{html_escape(b)}</li>' for b in bullets) + '</ul>')
            bullets.clear()
    for p in (paragraphs[:max_paragraphs] if max_paragraphs else paragraphs):
        p = p.strip()
        if not p: continue
        # Detect bullets (e.g., starts with "- ", "• ", or short noun phrase)
        if re.match(r'^[•\-\*]\s', p):
            bullets.append(p[2:].strip())
            continue
        # Numbered: "1. " "i." etc.
        if re.match(r'^[a-zA-Z0-9]+[\.\)]\s', p) and len(p) < 200:
            flush_bullets()
            out.append(f'<p>{html_escape(p)}</p>')
            continue
        flush_bullets()
        out.append(f'<p>{html_escape(p)}</p>')
    flush_bullets()
    return '\n'.join(out)


def normalize_topic_match(title):
    """Strip trailing punctuation and whitespace; lowercase."""
    return re.sub(r'[^a-z0-9 ]+', ' ', title.lower()).strip()


def find_topic_in_doc(lesson_struct, topic_title):
    """Find best matching topic dict in doc structure based on title similarity."""
    nt = normalize_topic_match(topic_title)
    candidates = []
    for t in lesson_struct:
        nt2 = normalize_topic_match(t['topic'])
        # Score by number of overlapping words
        words1 = set(nt.split()) - {'topic', 'and', 'the', 'a', 'in', 'of'}
        words2 = set(nt2.split()) - {'topic', 'and', 'the', 'a', 'in', 'of'}
        score = len(words1 & words2)
        candidates.append((score, t))
    candidates.sort(reverse=True, key=lambda x: x[0])
    return candidates[0][1] if candidates and candidates[0][0] > 0 else None


# === Layout selection ===
# 'each_text_left' = one text-left section per image (image + description)
# 'grid-3' = single grid-3 with all images, titles only
# 'single' = single layout
# 'side-by-side' = two images side by side

# For (lesson, topic-keyword), force a specific style. Keys are case-insensitive substrings.
LAYOUT_OVERRIDES = [
    # (lesson, topic-keyword, style)
    (2, 'tools', 'each_text_left'),     # each tool has its own description
    (3, 'peripheral', 'each_text_left'), # each peripheral has its own description
    (3, 'input devices', 'each_text_left'),
    (3, 'output devices', 'each_text_left'),
    (3, 'hardware components', 'grid-3'),  # overview thumbnails of components
    (7, 'types of networks', 'each_text_left'),  # PAN/LAN/MAN/WAN each described
    (4, 'step-by-step', 'grid-3'),       # assembly steps are visual; titles only
    (4, 'application', 'grid-3'),        # application software icons
    (4, 'software installation', 'grid-3'),
    (6, 'hardware preventive', 'each_text_left'),
    (6, 'types of preventive', 'each_text_left'),
    (7, 'network components', 'each_text_left'),
    (7, 'types of networks', 'each_text_left'),
]

def choose_style(lesson_num, topic_title, n_images):
    if n_images == 0: return None
    if n_images == 1: return 'single'
    tlower = topic_title.lower()
    for (ln, kw, style) in LAYOUT_OVERRIDES:
        if ln == lesson_num and kw in tlower:
            return style
    if n_images == 2: return 'side-by-side'
    return 'grid-3'


# Per-topic image titles (from captions in the image_index)
def load_image_captions():
    captions = {}
    with open(r'C:\Users\devpl\AppData\Local\Temp\image_index.txt', 'r', encoding='utf-8') as f:
        for block in f.read().strip().split('\n\n'):
            lines = block.strip().split('\n')
            if not lines: continue
            m = re.match(r'IMG_(\d+)', lines[0])
            if not m: continue
            idx = int(m.group(1))
            head = ''; ctx = ''
            for l in lines[1:]:
                l = l.strip()
                if l.startswith('HEAD:'): head = l[5:].strip()
                elif l.startswith('CTX:'): ctx = l[4:].strip()
            cap = ''
            if ctx:
                # First chunk before pipe
                first = ctx.split('|')[0].strip()
                if first: cap = first
            if not cap: cap = head
            # Trim long captions to short titles
            if cap.endswith(':'):
                cap = cap[:-1]
            # Strip trailing ".[N]" footnote marks
            cap = re.sub(r'\s*\[\d+\]\s*$', '', cap)
            cap = cap.strip()
            if len(cap) > 80:
                cap = cap[:80].rsplit(' ', 1)[0] + '…'
            captions[idx] = cap
    return captions

CAPTIONS = load_image_captions()


# Manual overrides for images whose context-derived caption is wrong/awkward.
CAPTION_OVERRIDES = {
    22: 'Wire Stripper',  # caption starts with "To properly use the tool..."
}

def short_caption(d):
    """Return a short title for image d, ideally just a 1-3 word noun phrase."""
    if d in CAPTION_OVERRIDES:
        return CAPTION_OVERRIDES[d]
    raw = CAPTIONS.get(d, '')
    if not raw: return f'Image {d}'
    short = re.split(r'[.,;]', raw, maxsplit=1)[0].strip()
    short = re.sub(r'\s+is\s+a\s+tool.*$', '', short, flags=re.I)
    short = re.sub(r'\s+used\s+to\s+.*$', '', short, flags=re.I)
    short = re.sub(r'\s+\-\s+.*$', '', short)
    short = short.strip(' :')
    # Reject single-letter or sub-letter titles (e.g. "d" from "d. WAN")
    if len(short) <= 2:
        # Try the next chunk after the prefix
        m = re.match(r'^[a-z]\s*[\.\)]\s*(.+)', raw, re.I)
        if m:
            short = re.split(r'[.,;]', m.group(1), maxsplit=1)[0].strip()
    return short[:60].strip(' :')


def canonical_name(s):
    """Lowercase + strip non-alnum for dedup."""
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def build_image_block_for_topic(lesson_num, images, topic_title=''):
    """Given a list of doc image indices, build appropriate image section(s)."""
    if not images: return []
    # De-duplicate by filename AND canonical short caption (doc has duplicates like phillips x2)
    seen_files = set()
    seen_names = set()
    unique = []
    for d in images:
        if d not in mapping: continue
        fn = mapping[d]
        if fn in seen_files: continue
        cname = canonical_name(short_caption(d))
        if cname and len(cname) >= 2 and cname in seen_names: continue
        seen_files.add(fn)
        if cname: seen_names.add(cname)
        unique.append(d)
    if not unique: return []

    style = choose_style(lesson_num, topic_title, len(unique))
    title_clean = re.sub(r'^Topic\s*\d+[\.:]\s*', '', topic_title).strip()[:80]

    if style == 'each_text_left':
        out = []
        for d in unique:
            short = short_caption(d)
            full_caption = CAPTIONS.get(d, '')
            html = f'<p><strong>{html_escape(short)}</strong></p>'
            if full_caption and full_caption != short:
                html += f'<p>{html_escape(full_caption)}</p>'
            out.append(make_image_section('text-left',
                                          [img_for(d, short)],
                                          side_texts=[html],
                                          title=short))
        return out

    if style == 'single':
        d = unique[0]
        return [make_image_section('single', [img_for(d, short_caption(d))], title=short_caption(d), caption=short_caption(d))]
    if style == 'side-by-side':
        return [make_image_section('side-by-side', [img_for(d, short_caption(d)) for d in unique], title=title_clean)]
    # grid-3 default
    return [make_image_section('grid-3', [img_for(d, short_caption(d)) for d in unique], title=title_clean)]


def rebuild_lesson(lesson_num, snap):
    """Rebuild a lesson snapshot in place using doc_struct."""
    if str(lesson_num) not in doc_struct:
        print(f'  no doc structure for lesson {lesson_num}')
        return snap
    mod = snap[0]
    sections = mod['sections']
    lesson_topics = doc_struct[str(lesson_num)]

    # Collect all needed doc images
    needed = set()
    for t in lesson_topics:
        for d in t.get('images', []):
            if d in mapping:
                needed.add(d)
    copy_assets(needed)

    new_sections = []
    i = 0
    while i < len(sections):
        s = sections[i]
        if s.get('type') == 'topic':
            # Walk till next topic or final-assessment
            start = i
            j = i + 1
            while j < len(sections) and sections[j].get('type') not in ('topic', 'final-assessment'):
                j += 1
            within = sections[start:j]
            topic_title = s.get('title', '')
            doc_topic = find_topic_in_doc(lesson_topics, topic_title)

            # Always keep the topic header
            new_sections.append(s)

            # Preserve quizzes, videos, final-assessment from within
            preserved = [x for x in within[1:] if x.get('type') in ('video', 'review-multiple-choice', 'review', 'final-assessment')]

            # Insert: rewritten paragraph(s) + image block
            if doc_topic:
                paragraphs = doc_topic.get('paragraphs', [])
                # Filter out lines that are just headings or subheading-like
                filtered_paragraphs = [p for p in paragraphs if not re.match(r'^[A-Z][A-Z\s]+$', p) and len(p) > 8]
                if filtered_paragraphs:
                    html = paragraphs_to_html(filtered_paragraphs, max_paragraphs=8)
                    if html:
                        new_sections.append(make_paragraph_section(html))
                # Image block(s)
                img_secs = build_image_block_for_topic(lesson_num, doc_topic.get('images', []), topic_title)
                new_sections.extend(img_secs)

            new_sections.extend(preserved)
            i = j
        elif s.get('type') == 'final-assessment':
            new_sections.append(s)
            i += 1
        else:
            # Pre-topic section (description, intro). Keep as-is for now (handled by lesson description).
            # But skip standalone paragraphs/images outside any topic to avoid duplicates.
            if s.get('type') in ('paragraph', 'image', 'subtopic'):
                # Skip — content will be regenerated if it falls inside a topic
                i += 1
                continue
            new_sections.append(s)
            i += 1

    for idx, sec in enumerate(new_sections, start=1):
        sec['order'] = idx
    mod['sections'] = new_sections
    return snap


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else ['2', '3', '4', '5', '6', '7']
    for t in targets:
        path = os.path.join(ROOT, 'lessons', f'lesson{t}_after_import_snapshot.json')
        if not os.path.exists(path):
            print(f'SKIP: {path} missing')
            continue
        with open(path, 'r', encoding='utf-8') as f:
            snap = json.load(f)
        old_count = len(snap[0]['sections'])
        old_img = sum(1 for s in snap[0]['sections'] if s.get('type') == 'image')

        backup = path.replace('.json', '.full.bak.json')
        if not os.path.exists(backup):
            shutil.copy2(path, backup)
        snap = rebuild_lesson(int(t), snap)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(snap, f, indent=2, ensure_ascii=False)
        new_count = len(snap[0]['sections'])
        new_img = sum(1 for s in snap[0]['sections'] if s.get('type') == 'image')
        print(f'L{t}: {old_count}->{new_count} sections, image sections {old_img}->{new_img}')


if __name__ == '__main__':
    main()
