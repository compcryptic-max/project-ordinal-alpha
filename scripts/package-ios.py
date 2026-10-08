"""Package a compiled iPhone app for personal-device signing. No credentials needed."""
import argparse
import hashlib
import plistlib
import stat
import subprocess
import zipfile
from pathlib import Path


def package(app: Path, output: Path):
    if not app.is_dir() or app.suffix != '.app':
        raise ValueError('Expected an existing .app directory')
    with (app / 'Info.plist').open('rb') as f:
        info = plistlib.load(f)
    if 'iPhoneOS' not in info.get('CFBundleSupportedPlatforms', []):
        raise ValueError('This must be an iPhone device build, not a simulator build')
    executable = app / info['CFBundleExecutable']
    if not executable.is_file():
        raise ValueError('The app executable is missing')
    subprocess.run(['lipo', '-verify_arch', 'arm64', str(executable)], check=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(app.rglob('*')):
            if file.is_dir() and not file.is_symlink():
                continue
            name = 'Payload/' + app.name + '/' + file.relative_to(app).as_posix()
            if file.is_symlink():
                item = zipfile.ZipInfo(name)
                item.create_system = 3
                item.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(item, str(file.readlink()))
            else:
                archive.write(file, name)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError('IPA integrity check failed')
        required = {'Payload/' + app.name + '/Info.plist', 'Payload/' + app.name + '/' + info['CFBundleExecutable']}
        if not required.issubset(archive.namelist()):
            raise ValueError('IPA is missing required files')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.ipa.sha256').write_text(f'{digest}  {output.name}\n')
    print(f'Packaged {info["CFBundleIdentifier"]}: {output} ({output.stat().st_size} bytes)')
    print('Unsigned: install with personal-device signing software; it cannot install directly from Safari.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    package(args.app, args.output)
