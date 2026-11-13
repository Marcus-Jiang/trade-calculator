import { readFileSync } from 'node:fs'

function read(relative) {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

const pkg = JSON.parse(read('../package.json'))
const conf = JSON.parse(read('../src-tauri/tauri.conf.json'))
const cargoVersion = read('../src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1]

const versions = {
  'package.json': pkg.version,
  'tauri.conf.json': conf.version,
  'Cargo.toml': cargoVersion
}

if (new Set(Object.values(versions)).size !== 1) {
  console.error('版本号不一致：')
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${file}: ${version ?? '(未找到)'}`)
  }
  process.exit(1)
}

console.log(`版本号一致：${pkg.version}`)
