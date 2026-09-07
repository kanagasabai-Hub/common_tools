/* ---------------------------------------------------------------------------
   Tool registry for the dashboard.

   TO ADD A TOOL: create tools/<your-tool>/index.html, then add one entry below.
   Nothing else needs changing — the dashboard builds itself from this list.

   Fields
     id          unique slug, also used for deep links (#id)
     name        shown on the card
     description one or two sentences, plain text
     href        path from the repo root. End it with index.html rather than a bare
                 folder: opening the dashboard from disk (file://) shows a directory
                 listing for a folder URL instead of loading the page.
     icon        a single emoji
     tags        lowercase keywords, used by search and the filter chips
     status      'live' | 'beta' | 'planned'
     updated     ISO date (YYYY-MM-DD) of the last meaningful change
     featured    optional; true pins the card to the front of the list
--------------------------------------------------------------------------- */

window.TOOLS = [
  {
    id: 'employee-cards',
    name: 'Employee Code & Seating Cards',
    description: 'Lay out employee codes and names as bordered cards on A4 — seating ' +
                 'stickers, 3×7 label sheets, badges or large guest tiles — and export ' +
                 'them as PDF, PNG or SVG.',
    href: 'tools/employee-cards/index.html',
    icon: '🏷️',
    tags: ['print', 'pdf', 'labels', 'a4', 'hr'],
    status: 'live',
    updated: '2026-09-07',
    featured: true
  }

  // Example of a placeholder entry — delete or replace:
  // ,{
  //   id: 'shift-roster',
  //   name: 'Shift Roster Builder',
  //   description: 'Turn a staff list into a printable weekly roster grid.',
  //   href: null,
  //   icon: '📅',
  //   tags: ['print', 'scheduling'],
  //   status: 'planned',
  //   updated: '2026-09-07'
  // }
];
