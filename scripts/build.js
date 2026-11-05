// Production build without source maps. Source maps would let anyone open
// the original source code (with comments) in the browser's DevTools.
// Works the same on Windows, macOS and Vercel.
process.env.GENERATE_SOURCEMAP = 'false';
require('react-scripts/scripts/build');
