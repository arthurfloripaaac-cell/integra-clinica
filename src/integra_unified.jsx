19:26:34.121 Running build in Washington, D.C., USA (East) – iad1
19:26:34.122 Build machine configuration: 2 cores, 8 GB
19:26:34.145 Cloning github.com/arthurfloripaaac-cell/integra-clinica (Branch: main, Commit: 9ac632a)
19:26:34.146 Skipping build cache, deployment was triggered without cache.
19:26:34.550 Cloning completed: 405.000ms
19:26:35.178 Running "vercel build"
19:26:35.204 Vercel CLI 54.4.1
19:26:35.917 Installing dependencies...
19:26:46.966 
19:26:46.966 added 62 packages in 11s
19:26:46.967 
19:26:46.967 7 packages are looking for funding
19:26:46.968   run `npm fund` for details
19:26:47.042 Running "npm run build"
19:26:47.198 
19:26:47.199 > integra-clinica@1.0.0 build
19:26:47.199 > vite build
19:26:47.200 
19:26:47.663 The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
19:26:47.725 vite v5.4.21 building for production...
19:26:47.793 transforming...
19:26:47.847 ✓ 4 modules transformed.
19:26:47.849 x Build failed in 92ms
19:26:47.849 error during build:
19:26:47.850 [vite:esbuild] Transform failed with 1 error:
19:26:47.850 /vercel/path1/src/integra_unified.jsx:407:0: ERROR: Expected "}" but found end of file
19:26:47.851 file: /vercel/path1/src/integra_unified.jsx:407:0
19:26:47.851 
19:26:47.851 Expected "}" but found end of file
19:26:47.851 405|                    <div className="avoid-break" style={{ marginBottom: "25px" }}>
19:26:47.852 406|                      <h3 style={{ margin
19:26:47.852 407|  
19:26:47.852    |  ^
19:26:47.853 
19:26:47.853     at failureErrorWithLog (/vercel/path1/node_modules/esbuild/lib/main.js:1472:15)
19:26:47.853     at /vercel/path1/node_modules/esbuild/lib/main.js:755:50
19:26:47.854     at responseCallbacks.<computed> (/vercel/path1/node_modules/esbuild/lib/main.js:622:9)
19:26:47.854     at handleIncomingPacket (/vercel/path1/node_modules/esbuild/lib/main.js:677:12)
19:26:47.854     at Socket.readFromStdout (/vercel/path1/node_modules/esbuild/lib/main.js:600:7)
19:26:47.855     at Socket.emit (node:events:509:28)
19:26:47.855     at addChunk (node:internal/streams/readable:563:12)
19:26:47.857     at readableAddChunkPushByteMode (node:internal/streams/readable:514:3)
19:26:47.857     at Readable.push (node:internal/streams/readable:394:5)
19:26:47.857     at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
19:26:47.879 Error: Command "npm run build" exited with 1
