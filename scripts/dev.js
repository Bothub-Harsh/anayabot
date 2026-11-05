const { spawn } = require('child_process');

const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

if (isProd) {
  console.log('🚀 Production environment detected. Starting production server...');
  const child = spawn('npm', ['run', 'start', '--prefix', 'server'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  child.on('exit', (code) => process.exit(code || 0));
} else {
  const child = spawn('npx', [
    'concurrently',
    '-n', 'server,client',
    '-c', 'blue,magenta',
    'npm run dev --prefix server',
    'npm run dev --prefix client'
  ], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  child.on('exit', (code) => process.exit(code || 0));
}
