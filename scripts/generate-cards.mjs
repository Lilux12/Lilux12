import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOGIN = process.env.GITHUB_LOGIN || 'Lilux12';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('GITHUB_TOKEN не задан');
  process.exit(1);
}

const FONT =
  "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const ACCENT = '#FF8C00';
const TEXT = '#E6EDF3';
const MUTED = '#8B949E';
const DIM = '#6E7681';
const BG = '#0D0D0D';
const BORDER = '#2A2A33';
const PALETTE = ['#FF8C00', '#FFB347', '#FF5E00', '#D97706', '#8A5A00', '#3A3A44'];

const query = `
  query ($login: String!) {
    user(login: $login) {
      followers { totalCount }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { contributionCount weekday date }
          }
        }
      }
      repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
        totalCount
        nodes {
          stargazerCount
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name } }
          }
        }
      }
    }
  }
`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'lilux-profile-cards',
  },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});

if (!response.ok) {
  throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
if (payload.errors) {
  throw new Error(`GraphQL: ${JSON.stringify(payload.errors)}`);
}

const user = payload.data.user;
const repos = user.repositories.nodes;
const stars = repos.reduce((sum, repo) => sum + repo.stargazerCount, 0);
const contributions = user.contributionsCollection.contributionCalendar.totalContributions;
const followers = user.followers.totalCount;
const repoCount = user.repositories.totalCount;

const languageBytes = new Map();
for (const repo of repos) {
  for (const edge of repo.languages.edges) {
    languageBytes.set(edge.node.name, (languageBytes.get(edge.node.name) || 0) + edge.size);
  }
}

const sortedLanguages = [...languageBytes.entries()]
  .map(([name, size]) => ({ name, size }))
  .sort((a, b) => b.size - a.size);

const topLanguages = sortedLanguages.slice(0, 5);
const otherSize = sortedLanguages.slice(5).reduce((sum, lang) => sum + lang.size, 0);
if (otherSize > 0) topLanguages.push({ name: 'другое', size: otherSize });
const totalBytes = sortedLanguages.reduce((sum, lang) => sum + lang.size, 0);

const escapeXml = (value) =>
  String(value).replace(/[<>&'"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[char]));

const formatNumber = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function plural(value, [one, few, many]) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const today = new Date().toLocaleDateString('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const weeks = user.contributionsCollection.contributionCalendar.weeks;
const maxDay = Math.max(
  1,
  ...weeks.flatMap((week) => week.contributionDays.map((day) => day.contributionCount)),
);

const stats = [
  {
    value: contributions,
    label: plural(contributions, ['контрибуция', 'контрибуции', 'контрибуций']),
    accent: true,
  },
  {
    value: repoCount,
    label: plural(repoCount, ['репозиторий', 'репозитория', 'репозиториев']),
  },
  { value: stars, label: plural(stars, ['звезда', 'звёзды', 'звёзд']) },
  {
    value: followers,
    label: plural(followers, ['подписчик', 'подписчика', 'подписчиков']),
  },
];

const statCenters = [81, 192, 303, 413];
const statSeparators = [136, 247, 358];

const statBlocks = stats
  .map((stat, index) => {
    const x = statCenters[index];
    return `
  <text x="${x}" y="78" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="800" fill="${stat.accent ? ACCENT : TEXT}">${formatNumber(stat.value)}</text>
  <text x="${x}" y="98" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${DIM}">${stat.label}</text>`;
  })
  .join('');

const separators = statSeparators
  .map((x) => `<path d="M${x} 52V96" stroke="#1F1F26"/>`)
  .join('\n  ');

const cell = 6;
const gap = 2;
const gridWidth = weeks.length * (cell + gap) - gap;
const gridX = 26 + (443 - gridWidth) / 2;
const gridY = 124;
const opacityFor = (count) => {
  if (count === 0) return 0;
  const level = Math.min(4, Math.max(1, Math.ceil((count / maxDay) * 4)));
  return [0, 0.28, 0.5, 0.74, 1][level];
};

const heatmap = weeks
  .flatMap((week, weekIndex) =>
    week.contributionDays.map((day) => {
      const x = gridX + weekIndex * (cell + gap);
      const y = gridY + day.weekday * (cell + gap);
      const opacity = opacityFor(day.contributionCount);
      const fill = opacity === 0 ? '#1B1B22' : ACCENT;
      const fillOpacity = opacity === 0 ? 1 : opacity;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell}" height="${cell}" rx="1.5" fill="${fill}" opacity="${fillOpacity}"><title>${day.date}: ${day.contributionCount}</title></rect>`;
    }),
  )
  .join('');

const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" fill="none" role="img" aria-labelledby="statsTitle statsDesc">
  <title id="statsTitle">Статистика GitHub ${LOGIN}</title>
  <desc id="statsDesc">${formatNumber(contributions)} контрибуций, ${repoCount} репозиториев, ${stars} звёзд, ${followers} подписчиков. Активность за последний год.</desc>

  <rect x="0.5" y="0.5" width="494" height="194" rx="8" fill="${BG}" stroke="${BORDER}"/>
  <text x="26" y="30" font-family="${FONT}" font-size="10" letter-spacing="2.5" fill="${ACCENT}">// GITHUB STATS</text>
  <text x="469" y="30" text-anchor="end" font-family="${FONT}" font-size="10" fill="${DIM}">обновлено ${today}</text>

  ${separators}
  ${statBlocks}

  <text x="26" y="116" font-family="${FONT}" font-size="9.5" letter-spacing="1.5" fill="${DIM}">АКТИВНОСТЬ ЗА 365 ДНЕЙ</text>
  ${heatmap}
</svg>
`;

const percentLabel = (size) => {
  const percent = (size / totalBytes) * 100;
  if (percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
};

let barX = 26;
const barWidth = 443;
const segments = topLanguages
  .map((language, index) => {
    const isLast = index === topLanguages.length - 1;
    const width = isLast
      ? barWidth - (barX - 26)
      : Math.max(0, (language.size / totalBytes) * barWidth - 1);
    const rect = `<rect x="${barX.toFixed(2)}" y="52" width="${width.toFixed(2)}" height="18" fill="${PALETTE[index] || PALETTE[PALETTE.length - 1]}"/>`;
    barX += width + (isLast ? 0 : 1);
    return rect;
  })
  .join('');

const legend = topLanguages
  .map((language, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 26 : 255;
    const y = 102 + row * 30;
    const percentX = column === 0 ? 238 : 467;
    return `
  <circle cx="${x + 4}" cy="${y - 4}" r="4" fill="${PALETTE[index] || PALETTE[PALETTE.length - 1]}"/>
  <text x="${x + 17}" y="${y}" font-family="${FONT}" font-size="13" fill="#C9D1D9">${escapeXml(language.name)}</text>
  <text x="${percentX}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${DIM}">${escapeXml(percentLabel(language.size))}</text>`;
  })
  .join('');

const langsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" fill="none" role="img" aria-labelledby="langsTitle langsDesc">
  <title id="langsTitle">Языки программирования ${LOGIN}</title>
  <desc id="langsDesc">Распределение языков по байтам кода в публичных репозиториях.</desc>

  <defs>
    <clipPath id="langsClip">
      <rect x="26" y="52" width="443" height="18" rx="9"/>
    </clipPath>
  </defs>

  <rect x="0.5" y="0.5" width="494" height="194" rx="8" fill="${BG}" stroke="${BORDER}"/>
  <text x="26" y="30" font-family="${FONT}" font-size="10" letter-spacing="2.5" fill="${ACCENT}">// TOP LANGUAGES</text>
  <text x="469" y="30" text-anchor="end" font-family="${FONT}" font-size="10" fill="${DIM}">по байтам кода</text>

  <g clip-path="url(#langsClip)">${segments}</g>
  ${legend}
</svg>
`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
await fs.mkdir(root, { recursive: true });
await fs.writeFile(path.join(root, 'stats.svg'), statsSvg);
await fs.writeFile(path.join(root, 'langs.svg'), langsSvg);

console.log(
  `Карточки обновлены: ${contributions} контрибуций, ${repoCount} репо, ${stars} звёзд, ${followers} подписчиков, ${topLanguages.length} языков.`,
);
