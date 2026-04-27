"""Rebuild image sections in lesson snapshots using renamed webps and doc-derived layouts."""
import json, os, shutil, time, sys

ROOT = r'c:\Users\devpl\Desktop\modulearn - deploy'
folder = os.path.join(ROOT, 'lesson images webp')
uploads = os.path.join(ROOT, 'backend', 'uploads', 'lessons')

with open(os.path.join(folder, '_rename_log.json'), 'r', encoding='utf-8') as f:
    log = json.load(f)
mapping = {}
for p in log['plan']:
    didx = p.get('doc_idx')
    if didx and didx not in mapping:
        mapping[didx] = p['new']


def img_for(didx, caption=''):
    fn = mapping[didx]
    return {'url': f'/uploads/lessons/{fn}', 'fileName': fn, 'caption': caption}


_next_id = int(time.time() * 1000)
def new_id():
    global _next_id
    _next_id += 1
    return _next_id


def make_image_section(layout, images_data, side_texts=None, caption='', title=''):
    s = {
        'id': new_id(),
        'file': None,
        'type': 'image',
        'order': 0,
        'title': title,
        'images': [{'url': img['url'], 'file': None, 'fileName': img['fileName'], 'caption': img.get('caption', '')} for img in images_data],
        'layout': layout,
        'caption': caption,
        'content': images_data[0]['url'] if images_data else '',
        'fileName': images_data[0]['fileName'] if images_data else None,
    }
    if layout in ('text-left', 'text-right'):
        s['sideTexts'] = side_texts or ['']
        s['layerImages'] = [[{'url': img['url'], 'file': None, 'fileName': img['fileName'], 'caption': img.get('caption', '')}] for img in images_data]
    return s


def copy_assets(needed_doc_ids):
    os.makedirs(uploads, exist_ok=True)
    copied = 0
    for d in sorted(needed_doc_ids):
        if d not in mapping:
            print(f'  WARN: doc#{d} has no rename mapping')
            continue
        src = os.path.join(folder, mapping[d])
        dst = os.path.join(uploads, mapping[d])
        if not os.path.exists(src):
            print(f'  ERROR: source missing: {src}')
            continue
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
        copied += 1
    return copied


def topic_key_for_lesson2(title):
    t = title.lower()
    if 'electric' in t: return 'Electric Hazards'
    if 'physical' in t: return 'Physical Hazards'
    if 'tools' in t and 'topic' in t: return 'Tools'
    if 'report' in t: return 'Reporting and Documenting'
    return None


def rebuild_lesson2(snap):
    mod = snap[0]
    sections = mod['sections']

    ELECTRIC = [
        (1, 'Damaged or Exposed Wires'),
        (2, 'Overloading Power Outlets'),
        (3, 'Wet Areas Near Equipment'),
        (4, 'Faulty Power Supplies or Old Equipment'),
        (5, 'Poor Cable Management'),
        (6, 'Ungrounded Outlets'),
    ]
    PHYSICAL = [
        (7, 'Poor Workstation Setup'),
        (8, 'Misplaced Equipment'),
        (9, 'Unsafe Lifting Techniques'),
        (10, 'Cluttered Areas'),
        (11, 'Inadequate Lighting or Ventilation'),
    ]
    TOOLS = [
        (12, 'Phillips Head Screwdriver', 'A tool used to loosen or tighten cross-head screws. Select the right size bit for the screw head to avoid stripping. Apply firm, straight downward pressure while turning clockwise to tighten or counter-clockwise to loosen.'),
        (14, 'Flat Head Screwdriver', 'A tool used to loosen or tighten slotted screws — those with a single straight slot on the head. Match the blade width to the screw slot exactly. Insert fully straight into the slot, then turn slowly with steady pressure to avoid slipping out.'),
        (17, 'Torx Screwdriver', 'A tool used to loosen or tighten screws that have a star-like depression on the top. Align the T-bit precisely with the star-shaped recess. Rotate smoothly with even force; Torx resists stripping better than other types.'),
        (18, 'Hex Driver', 'Sometimes called a nut driver, it tightens nuts the same way a screwdriver tightens screws. Choose the correct hex size (e.g., 2mm–5mm for PC cases). Insert fully into the socket and turn steadily — never force a wrong-size driver.'),
        (20, 'Needle Nose Pliers', 'Used to hold small parts. Grip small components or wires firmly in the tapered jaws without squeezing too hard. Use them for bending leads or holding parts; avoid cutting with them unless they are designed for it.'),
        (21, 'Wire Cutter', 'Used to strip and cut wires. Position the wire in the appropriate notch for its gauge. Close the handles fully in one smooth motion to shear cleanly, then release; cut perpendicular to the wire to minimize fraying.'),
        (22, 'Wire Stripper', 'Select the notch matching the wire gauge (e.g., 22–24 AWG). Clamp lightly on insulation about 1/4 inch from the end, rotate if needed, then pull to remove the sheath without nicking the conductor.'),
        (23, 'Flashlight', 'A tool used to light up areas that you cannot see well. Press the button to turn it on; brighten tight spaces like PC internals by directing beams at an angle to minimize glare. Hold steady or use a head-mounted version for hands-free work.'),
        (24, 'Part Retriever', 'Used to retrieve parts from locations that are too small for your hand to fit. Use the hooked or magnetic end to gently snag dropped screws or jumpers from cases. Hook under the item and pull slowly to avoid losing it.'),
        (25, 'Tweezers', 'Used to manipulate small parts. Grasp tiny components like capacitors by their edges with precision tips. Apply minimal force to position or remove; anti-static versions prevent ESD damage to chips.'),
        (26, 'Crimping Tool', 'A specialized hand tool used to join wires or cables to connectors by compressing a metal terminal around the stripped wire end, creating a secure, solderless electrical connection. Color-coded or sized dies match common terminals.'),
        (27, 'RJ45 Connector', 'A standardized 8-pin connector, known as Registered Jack 45, commonly used at the ends of Ethernet cables for wired network connections in LANs. It enables computers, routers, and switches to transmit data via twisted-pair cables.'),
        (28, 'Loopback Adapter', 'Used to test the functionality of computer ports. Insert the adapter firmly into the network port only on powered-off devices or isolated test setups to avoid network loops that could flood switches.'),
        (29, 'Multimeter', 'Used to test the integrity of circuits and the quality of electricity in computer components. Set to the correct mode and range before probing (e.g., DC volts for low-voltage circuits). Touch probes only to clean contacts.'),
        (30, 'LAN Tester', 'Also known as a network cable tester, this is a handheld diagnostic device used to verify the integrity, wiring continuity, and proper pin assignments of Ethernet or LAN cables. It detects faults like shorts, opens, and miswires.'),
        (31, 'Lint-Free Cloth', 'Used to clean different computer components without scratching or leaving debris. Wipe surfaces gently in one direction using minimal pressure to avoid lint transfer; pair with isopropyl alcohol for stubborn residue.'),
        (32, 'Compressed Air', 'Used to blow away dust and debris from computer parts without touching components. Hold the can upright and use short bursts from 4–6 inches away to dislodge dust without freezing components or pushing debris deeper.'),
        (34, 'Anti-Static Mat', 'Used to stand on or place hardware on to prevent static electricity from building up. Place the mat on a flat workbench, connect its grounding cord to a grounded outlet, and position components on it during servicing.'),
        (35, 'Anti-Static Wrist Strap', 'Used to prevent ESD damage to computer equipment. Snap the strap securely around your wrist, attach the alligator clip to the mat’s grounding point or a grounded chassis. Verify continuity before handling sensitive components.'),
    ]
    REPORTING = [
        (36, 'Importance of Reporting', 'Reporting accidents or hazards in the workplace is essential for fostering a proactive safety culture, especially when handling tools like screwdrivers, multimeters, or compressed air in computer servicing.', 'text-left'),
        (37, 'Legal and Organizational Compliance', 'Philippine regulations under Republic Act No. 11058 (Occupational Safety and Health Standards) and DOLE Department Order No. 198-18 mandate immediate reporting of workplace accidents via Employer’s Report of Injury or Illness forms.', 'text-left'),
        (38, 'OSHA 301 Form', '', 'single'),
    ]

    needed = set([d for d, _ in ELECTRIC + PHYSICAL] + [d for d, _, _ in TOOLS] + [d for d, _, _, _ in REPORTING])
    missing = [d for d in sorted(needed) if d not in mapping]
    if missing:
        raise RuntimeError(f'Missing webps for doc indices: {missing}')
    copy_assets(needed)

    blocks = {
        'Electric Hazards': [make_image_section('grid-3', [img_for(d, t) for d, t in ELECTRIC], title='Electric Hazards')],
        'Physical Hazards': [make_image_section('grid-3', [img_for(d, t) for d, t in PHYSICAL], title='Physical Hazards')],
        'Tools': [
            make_image_section('text-left', [img_for(d, name)],
                               side_texts=[f'<p><strong>{name}</strong></p><p>{desc}</p>'],
                               title=name)
            for d, name, desc in TOOLS
        ],
        'Reporting and Documenting': [
            (make_image_section('single', [img_for(d, name)], title=name, caption=name)
             if layout == 'single'
             else make_image_section('text-left', [img_for(d, name)],
                                     side_texts=[f'<p><strong>{name}</strong></p><p>{desc}</p>'],
                                     title=name))
            for d, name, desc, layout in REPORTING
        ],
    }

    new_sections = []
    i = 0
    while i < len(sections):
        s = sections[i]
        if s.get('type') == 'topic':
            key = topic_key_for_lesson2(s.get('title', ''))
            start = i
            j = i + 1
            while j < len(sections) and sections[j].get('type') not in ('topic', 'final-assessment'):
                j += 1
            within = sections[start:j]
            if key:
                kept = [x for x in within if x.get('type') != 'image']
                new_sections.extend(kept)
                new_sections.extend(blocks[key])
            else:
                new_sections.extend(within)
            i = j
        else:
            new_sections.append(s)
            i += 1

    for idx, s in enumerate(new_sections, start=1):
        s['order'] = idx

    mod['sections'] = new_sections
    return snap


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else '2'
    snapshot_path = os.path.join(ROOT, 'lessons', f'lesson{target}_after_import_snapshot.json')
    with open(snapshot_path, 'r', encoding='utf-8') as f:
        snap = json.load(f)
    old_count = len(snap[0]['sections'])
    old_img = sum(1 for s in snap[0]['sections'] if s.get('type') == 'image')

    if target == '2':
        snap = rebuild_lesson2(snap)
    else:
        raise NotImplementedError(f'Lesson {target} rebuild not implemented yet')

    new_count = len(snap[0]['sections'])
    new_img = sum(1 for s in snap[0]['sections'] if s.get('type') == 'image')

    backup = snapshot_path.replace('.json', '.preimg.bak.json')
    if not os.path.exists(backup):
        shutil.copy2(snapshot_path, backup)
        print(f'Backup -> {backup}')

    with open(snapshot_path, 'w', encoding='utf-8') as f:
        json.dump(snap, f, indent=2, ensure_ascii=False)
    print(f'Wrote {snapshot_path}')
    print(f'Sections: {old_count} -> {new_count}')
    print(f'Image sections: {old_img} -> {new_img}')


if __name__ == '__main__':
    main()
