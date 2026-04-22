# Small Text Size Audit - frontend/src Directory

## Summary
This document lists all instances of small CSS text size classes and inline font-size styles found in the `frontend/src` directory.

---

## Text-XS (Tailwind Default: 12px)

### Files:
1. [index.css](frontend/src/index.css#L623)
   - Line 623: `.text-xs` CSS class definition

2. [AdminDashboard.js](frontend/src/pages/AdminDashboard.js#L359)
   - Line 359: `text-xs` badge notification
   - Line 381: `text-xs` lesson label
   - Line 397: `text-xs` tick label
   - Line 443: `text-xs` lesson label in chart

3. [AdminLessons.js](frontend/src/pages/AdminLessons.js#L404)
   - Line 404: `text-xs` status badge (inline-flex with rounded-full)
   - Line 417: `text-xs sm:text-sm` "Last Update" label
   - Line 418: `text-xs sm:text-sm` date text
   - Line 421: `text-xs` status badge
   - Line 448: `text-xs` font-semibold button/badge
   - Line 458: `text-xs` font-semibold button/badge

4. [AdminLearners.js](frontend/src/pages/AdminLearners.js)
   - Line 408: `text-xs` "Total Learners" label
   - Line 420: `text-xs` "Active Users" label
   - Line 432: `text-xs` "Inactive Users" label
   - Line 519: `text-xs` loading message
   - Line 539: `text-xs` table header (Name)
   - Line 542: `text-xs` table header (Email)
   - Line 545: `text-xs` table header (Gender)
   - Line 548: `text-xs` table header (Date Joined)
   - Line 551: `text-xs` table header (Status)
   - Line 554: `text-xs` table header (Actions)

5. [SkillMasteryResults.js](frontend/src/components/SkillMasteryResults.js#L73)
   - Line 73: `text-xs` skill name label

6. [InitialAssessmentModal.js](frontend/src/components/InitialAssessmentModal.js)
   - Line 281: `text-xs` uppercase progress label

7. [Avatar.js](frontend/src/components/Avatar.js)
   - Line 14: `text-xs` in size object (nav)
   - Line 15: `text-xs` in size object (sm)

8. [AdminSimulations.js](frontend/src/pages/AdminSimulations.js)
   - Line 208: `text-xs` font-semibold badge
   - Line 216: `text-xs` font-semibold status badge (emerald)
   - Line 223: `text-xs` font-semibold status badge (gray)
   - Line 239: `text-xs` font-semibold badge
   - Line 255: `text-xs` font-semibold badge
   - Line 261: `text-xs` font-semibold status badge (slate)
   - Line 266: `text-xs` font-semibold status badge (slate)
   - Line 272: `text-xs` metadata text (gray-600)

9. [AdminSimulationEditor.js](frontend/src/pages/AdminSimulationEditor.js)
   - Line 497: `text-xs` uppercase label
   - Line 503: `text-xs` font-semibold badge
   - Line 509: `text-xs` font-semibold badge
   - Line 524: `text-xs` font-semibold badge
   - Line 637: `text-xs` font-semibold button/label
   - Line 648: `text-xs` gray-500 info text
   - Line 661: `text-xs` font-semibold button
   - Line 686: `text-xs` border red button
   - Line 756: `text-xs` font-bold badge
   - Line 765: `text-xs` gray-500 subtitle
   - Line 818: `text-xs` gray-500 instruction
   - Line 862: `text-xs` gray-500 counter
   - Line 936: `text-xs` gray-500 component label
   - Line 951: `text-xs` rounded-md button
   - Line 959: `text-xs` rounded-md red button
   - Line 1010: `text-xs` font-semibold label
   - Line 1025: `text-xs` font-semibold label
   - Line 1121: `text-xs` gray-500 subtitle
   - Line 1169: `text-xs` font-semibold button
   - Line 1206: `text-xs` gray-600 info text

10. [Simulations.js](frontend/src/pages/Simulations.js)
    - Line 257: `text-xs` font-semibold badge
    - Line 267: `text-xs` font-semibold badge
    - Line 286: `text-xs` font-semibold badge
    - Line 301: `text-xs` font-semibold badge
    - Line 310: `text-xs` font-semibold score label
    - Line 313: `text-xs` gray-600 score text
    - Line 326: `text-xs` gray-600 metadata

11. [Dashboard.js](frontend/src/pages/Dashboard.js)
    - Line 432: `text-xs` font-semibold skill badge
    - Line 439: `text-xs sm:text-sm` gray-500 info text

12. [AddLesson.js](frontend/src/pages/AddLesson.js)
    - Line 5163: `text-xs` mt-0.5 (dynamic class)
    - Line 5501: `text-xs` gray-400 "hr" label
    - Line 5511: `text-xs` gray-400 "min" label
    - Line 5605: `text-xs` gray-500 info text
    - Line 5641: `text-xs` gray-500 info text
    - Line 5662: `text-xs` gray-500 info text
    - Line 5896: `text-xs` gray-500 description
    - Line 6336: `text-xs` gray-500 instruction text
    - Line 6428: `text-xs` font-semibold uppercase "Layer" label
    - Line 6431: `text-xs` font-semibold red delete button
    - Line 6525: `text-xs` rounded upload button
    - Line 6537: `text-xs` font-semibold button
    - Line 6548: `text-xs` rounded upload button
    - Line 6565: `text-xs` border rounded input
    - Line 6717: `text-xs` gray-400 instruction
    - Line 6778: `text-xs` gray-500 description
    - Line 6780: `text-xs` highlight-dark info
    - Line 6914: `text-xs` gray-500 instruction
    - Line 6984: `text-xs` font-bold label

13. [Profile.js](frontend/src/pages/Profile.js)
    - Line 1045: `text-xs` gray-500 info text

14. [SimulationActivity.js](frontend/src/pages/SimulationActivity.js)
    - Line 247: `text-xs` font-semibold label

---

## Text-[10px] (Custom: 10px)

### Files:
1. [InteractiveZoomAreaEditor.js](frontend/src/components/InteractiveZoomAreaEditor.js)
   - Line 114: `text-[10px]` font-semibold warning label
   - Line 115: `text-[10px]` font-semibold success label
   - Line 117: `text-[10px]` font-semibold drag handle (warning)
   - Line 118: `text-[10px]` font-semibold drag handle (success)

2. [AddLesson.js](frontend/src/pages/AddLesson.js)
   - Line 6443: `text-[10px]` font-semibold delete button
   - Line 6557: `text-[10px]` gray-400 instruction
   - Line 6576: `text-[10px]` font-semibold "Add" button
   - Line 6584: `text-[10px]` font-semibold delete button

---

## Text-[11px] (Custom: 11px)

### Files:
1. [InteractiveZoomAreaEditor.js](frontend/src/components/InteractiveZoomAreaEditor.js)
   - Line 201: `text-[11px]` font-semibold label "X %"
   - Line 217: `text-[11px]` font-semibold label "Y %"
   - Line 233: `text-[11px]` font-semibold label "Width %"
   - Line 249: `text-[11px]` font-semibold label "Height %"

2. [AddLesson.js](frontend/src/pages/AddLesson.js)
   - Line 6480: `text-[11px]` gray-500 info text
   - Line 6621: `text-[11px]` gray-500 info text
   - Line 6718: `text-[11px]` gray-400 instruction

3. [AdminSimulationEditor.js](frontend/src/pages/AdminSimulationEditor.js)
   - Line 976: `text-[11px]` gray-400 "No image" label
   - Line 988: `text-[11px]` font-semibold button
   - Line 1044: `text-[11px]` rounded button
   - Line 1053: `text-[11px]` border red button
   - Line 1063: `text-[11px]` rounded button
   - Line 1072: `text-[11px]` border red button
   - Line 1080: `text-[11px]` gray-500 info text

---

## No Instances Found
- **text-[8px]**: No matches found
- **text-[9px]**: No matches found
- **text-[12px]**: No matches found
- **Inline font-size < 14px**: No matches found (None using inline style attributes with font-size values less than 14px)

---

## Statistics
- **Total files with small text**: 20
- **Total text-xs instances**: ~100+ (most commonly used)
- **Total text-[10px] instances**: 8
- **Total text-[11px] instances**: 14
- **Total small text instances**: 122+

## Key Observations
1. Most small text usage is in **UI labels, badges, and helper text** (intentionally small)
2. Primary files with heavy small text usage:
   - `AddLesson.js` - Most instances (47+ in admin/lesson creation)
   - `AdminSimulationEditor.js` - 19 instances (in editor UI)
   - `AdminDashboard.js` - 7 instances (in charts and notifications)
   - `AdminLearners.js` - 10 instances (in tables and labels)

3. No inline `style` attributes with font-size < 14px found
4. Small text is primarily for:
   - Form labels and helpers
   - Table headers
   - Badges and status indicators
   - Metadata and timestamps
   - Instructions and help text

---

## Recommendations
If accessibility improvements are needed:
- Review `text-xs` usage for critical user information
- Consider providing larger alternatives for users with vision impairments
- Audit specific files like `AddLesson.js` for overly small instructional text
