const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/PlatformHub.tsx');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Replace background
content = content.replace(
  'className="min-h-screen bg-gradient-to-br from-[hsl(var(--claude-bg))] to-gray-50 p-8"',
  'className="min-h-screen bg-[#FAFAFA] p-8"'
);

// Replace header text colors
content = content.replace(
  'text-4xl font-bold text-[hsl(var(--claude-text))] mb-2',
  'text-4xl font-bold text-stone-900 mb-2'
);

content = content.replace(
  'text-[hsl(var(--claude-text-secondary))]',
  'text-stone-600',
  'g'
);

// Replace Install Extension button
content = content.replace(
  '<Button className="bg-[hsl(var(--claude-accent))]">',
  '<Button className="bg-stone-900 hover:bg-stone-800 text-white">'
);

// Replace stats cards with glassmorphic gray design
const statsCardPattern = /<Card className="p-6 bg-card border-\[hsl\(var\(--claude-border\)\)\]">/g;
content = content.replace(
  statsCardPattern,
  '<Card className="p-6 bg-white/50 backdrop-blur-[16px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)]">'
);

// Replace colored stat numbers with stone-900
content = content.replace(
  'text-3xl font-bold text-green-500',
  'text-3xl font-bold text-stone-900'
);

content = content.replace(
  'text-3xl font-bold text-[hsl(var(--claude-accent))]',
  'text-3xl font-bold text-stone-900'
);

content = content.replace(
  'text-3xl font-bold text-blue-500',
  'text-3xl font-bold text-stone-900'
);

content = content.replace(
  'text-3xl font-bold text-purple-500',
  'text-3xl font-bold text-stone-900'
);

// Replace icon colors in stats
content = content.replace(
  /<CheckCircle2 className="w-10 h-10 text-green-500 opacity-20" \/>/,
  '<CheckCircle2 className="w-10 h-10 text-stone-600 opacity-20" />'
);

content = content.replace(
  /<LinkIcon className="w-10 h-10 text-\[hsl\(var\(--claude-accent\)\)\] opacity-20" \/>/,
  '<LinkIcon className="w-10 h-10 text-stone-600 opacity-20" />'
);

content = content.replace(
  /<TrendingUp className="w-10 h-10 text-blue-500 opacity-20" \/>/,
  '<TrendingUp className="w-10 h-10 text-stone-600 opacity-20" />'
);

content = content.replace(
  /<Sparkles className="w-10 h-10 text-purple-500 opacity-20" \/>/,
  '<Sparkles className="w-10 h-10 text-stone-600 opacity-20" />'
);

// Replace search input
content = content.replace(
  /<Search className="absolute left-3 top-1\/2 -translate-y-1\/2 w-5 h-5 text-muted-foreground" \/>/,
  '<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />'
);

content = content.replace(
  'className="w-full pl-10 pr-4 py-3 border border-[hsl(var(--claude-border))] rounded-lg\n                       focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))]"',
  'className="w-full pl-10 pr-4 py-3 bg-white/50 backdrop-blur-[16px] border border-black/[0.06] rounded-lg\n                       text-stone-900 placeholder:text-stone-500\n                       focus:outline-none focus:ring-2 focus:ring-stone-900"'
);

// Replace select dropdown
content = content.replace(
  'className="px-4 py-3 border border-[hsl(var(--claude-border))] rounded-lg\n                     focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))]"',
  'className="px-4 py-3 bg-white/50 backdrop-blur-[16px] border border-black/[0.06] rounded-lg\n                     text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"'
);

// Replace category colors
content = content.replace(/color: 'from-purple-500 to-pink-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-green-500 to-emerald-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-blue-500 to-cyan-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-orange-500 to-red-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-indigo-500 to-purple-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-yellow-500 to-orange-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-pink-500 to-rose-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-slate-500 to-gray-500'/g, "color: 'bg-stone-900'");
content = content.replace(/color: 'from-violet-500 to-purple-500'/g, "color: 'bg-stone-900'");

// Replace category icon background
content = content.replace(
  /className=\{\`w-12 h-12 rounded-xl bg-gradient-to-br \$\{category\.color\}/g,
  'className={`w-12 h-12 rounded-xl ${category.color}'
);

// Replace category heading colors
content = content.replace(
  'text-2xl font-semibold text-[hsl(var(--claude-text))]',
  'text-2xl font-semibold text-stone-900'
);

// Replace browser extension CTA
content = content.replace(
  '<Card className="bg-gradient-to-r from-[hsl(var(--claude-accent))] to-purple-600 p-8 text-white">',
  '<Card className="bg-white/50 backdrop-blur-[16px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)] p-8">'
);

content = content.replace(
  '<h3 className="text-2xl font-bold mb-2">',
  '<h3 className="text-2xl font-bold text-stone-900 mb-2">'
);

content = content.replace(
  /<p className="text-white\/90 mb-4">/,
  '<p className="text-stone-600 mb-4">'
);

content = content.replace(
  /<Badge className="bg-card\/20 text-white">/g,
  '<Badge className="bg-black/[0.04] text-stone-900 border-none">'
);

content = content.replace(
  '<Button className="bg-card text-[hsl(var(--claude-accent))] hover:bg-muted">',
  '<Button className="bg-stone-900 hover:bg-stone-800 text-white">'
);

// Replace platform card styling
content = content.replace(
  /className=\{\`p-6 border-2 transition-all duration-200 hover:shadow-xl\s+\$\{platform\.connected\s+\? 'border-green-500 bg-green-50'\s+: 'border-\[hsl\(var\(--claude-border\)\)\] hover:border-\[hsl\(var\(--claude-accent\)\)\]'\s+\}\`\}/,
  `className={\`p-6 border transition-all duration-200 bg-white/50 backdrop-blur-[16px]
                     \${platform.connected
                       ? 'border-stone-900 shadow-[0_4px_16px_rgba(0,0,0,0.08)]'
                       : 'border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:border-black/[0.12]'
                     }\`}`
);

// Replace platform card text colors
content = content.replace(
  'font-semibold text-[hsl(var(--claude-text))]',
  'font-semibold text-stone-900'
);

content = content.replace(
  'text-xs text-green-600',
  'text-xs text-stone-600'
);

content = content.replace(
  /<CheckCircle2 className="w-6 h-6 text-green-500" \/>/,
  '<CheckCircle2 className="w-6 h-6 text-stone-900" />'
);

// Replace integration badges
content = content.replace(
  /<Badge className="bg-green-500 text-white">⚡ MCP<\/Badge>/g,
  '<Badge className="bg-stone-900 text-white">⚡ MCP</Badge>'
);

content = content.replace(
  /<Badge className="bg-blue-500 text-white">🔐 OAuth<\/Badge>/g,
  '<Badge className="bg-stone-900 text-white">🔐 OAuth</Badge>'
);

content = content.replace(
  /<Badge className="bg-purple-500 text-white">🔌 Extension<\/Badge>/g,
  '<Badge className="bg-stone-900 text-white">🔌 Extension</Badge>'
);

// Replace outline badge styling
content = content.replace(
  /<Badge key=\{type\} variant="outline" className="text-xs">/g,
  '<Badge key={type} variant="outline" className="text-xs border-black/[0.06] text-stone-600">'
);

content = content.replace(
  /<Badge variant="outline" className="text-xs">/g,
  '<Badge variant="outline" className="text-xs border-black/[0.06] text-stone-600">'
);

// Replace soul insights styling
content = content.replace(
  /<Sparkles className="w-3 h-3 text-purple-500" \/>/,
  '<Sparkles className="w-3 h-3 text-stone-600" />'
);

content = content.replace(
  'text-xs font-medium text-purple-600',
  'text-xs font-medium text-stone-900'
);

content = content.replace(
  'text-xs text-muted-foreground bg-purple-50',
  'text-xs text-stone-600 bg-black/[0.04]'
);

// Replace connect button
content = content.replace(
  'className="w-full bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90"',
  'className="w-full bg-stone-900 hover:bg-stone-800 text-white"'
);

content = content.replace(
  '<Button variant="outline" className="w-full" disabled>',
  '<Button variant="outline" className="w-full border-stone-900 text-stone-900" disabled>'
);

// Replace getIntegrationBadge function (both instances)
content = content.replace(
  /<Badge className="bg-green-500 text-white text-xs">⚡ MCP<\/Badge>/g,
  '<Badge className="bg-stone-900 text-white text-xs">⚡ MCP</Badge>'
);

content = content.replace(
  /<Badge className="bg-blue-500 text-white text-xs">🔐 OAuth<\/Badge>/g,
  '<Badge className="bg-stone-900 text-white text-xs">🔐 OAuth</Badge>'
);

content = content.replace(
  /<Badge className="bg-purple-500 text-white text-xs">🔌 Extension<\/Badge>/g,
  '<Badge className="bg-stone-900 text-white text-xs">🔌 Extension</Badge>'
);

// Write the updated content
fs.writeFileSync(filePath, content, 'utf8');

console.log('Platform Hub updated with minimalist gray design system!');
