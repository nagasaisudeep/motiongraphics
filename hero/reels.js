// Every reel the ring can show. 16 DOM cards cycle through these, repeating as needed.
// To add a reel: full video in videos/reels/, 5s preview loops in videos/previews/, cover stills in videos/covers/,
// then add an entry here and in PROJECTS in ../index.html.
// Keep titles in step with the reel entries in PROJECTS in ../index.html, which plays them.
const RENDERS = [
  { title: 'Ajmal Perfumes Reel One', file: 'render-1', clips: 3 },
  { title: 'Ajmal Perfumes Reel Two', file: 'render-2', clips: 3 },
  { title: 'Video Editors Hiring Reel', file: 'render-3', clips: 4, company: 'Hiring Campaign' },
];
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '');

// alternate renders (clip 0 of each, then clip 1 …) so neighbouring cards differ
export const REELS = [];
for (let k = 0; k < Math.max(...RENDERS.map(r => r.clips)); k++)
  for (const r of RENDERS) if (k < r.clips) REELS.push({
    title: r.title,
    company: r.company || 'Ajmal Perfumes',
    href: `index.html?from=reels#${slug(r.title)}`,   // opens the same player as Work
    cover: `videos/covers/${r.file}-${k}.jpg`,
    video: `videos/previews/${r.file}-${k}.mp4`,
  });
