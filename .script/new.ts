import * as fs from 'fs-extra';

async function main(packageName: string) {
  if (packageName == null) {
    console.log(`Usage: pnpm new <package-name>`);
    process.exit(0);
  }
  await fs.copy('./.script/template', `./packages/${packageName}`, { recursive: true, errorOnExist: true });
  process.chdir(`./packages/${packageName}`);

  await edit('./package.json', `{{packageName}}`, packageName);
  await edit('./src/index.ts', `{{packageName}}`, packageName);

  console.log(`A pacakge '@saehun/${packageName}' is generated ✨`);
}

main(process.argv[2]);

async function edit(path: string, pattern: string, replaceText: string) {
  const regex = new RegExp(pattern);
  const content = await fs.readFile(path, { encoding: 'utf-8' });
  await fs.writeFile(path, content.replace(regex, replaceText));
}
