import soulRoutes from './api/routes/soul-extraction.js';

console.log('Soul routes loaded');
console.log('Routes count:', soulRoutes.stack?.length || 0);

if (soulRoutes.stack) {
  console.log('\nAll routes:');
  soulRoutes.stack.forEach((layer, i) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      console.log(`  ${i + 1}. ${methods} ${layer.route.path}`);
    }
  });

  console.log('\nSearching for spotify-deep:');
  const spotifyDeep = soulRoutes.stack.find(r =>
    r.route && r.route.path && r.route.path.includes('spotify-deep')
  );

  if (spotifyDeep) {
    console.log('✅ Found:', spotifyDeep.route.path);
  } else {
    console.log('❌ Not found');
  }

  console.log('\nSearching for youtube-deep:');
  const youtubeDeep = soulRoutes.stack.find(r =>
    r.route && r.route.path && r.route.path.includes('youtube-deep')
  );

  if (youtubeDeep) {
    console.log('✅ Found:', youtubeDeep.route.path);
  } else {
    console.log('❌ Not found');
  }
}
