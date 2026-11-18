"""Stage a verified static release, then atomically switch the webroot.
Transport is intentionally external (the configured SSH skill).
"""
import argparse,hashlib,json,os,shutil,tarfile
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('mode',choices=['stage','activate'])
p.add_argument('archive');p.add_argument('release');p.add_argument('sha256');p.add_argument('previous')
a=p.parse_args();root=Path('/var/www/crazyshoot');release=Path(a.release);previous=Path(a.previous)
assert release.parent==root/'releases' and previous.parent==root/'releases'
assert release!=previous

def verify():
    manifest=json.loads((release/'release-manifest.json').read_text())
    for name,expected in manifest['files'].items():
        f=release/name
        assert os.path.commonpath([str(f.resolve()),str(release.resolve())])==str(release.resolve()),name
        assert hashlib.sha256(f.read_bytes()).hexdigest()==expected,name
    assert json.loads((release/'version.json').read_text())==manifest['identity']
    return manifest

if a.mode=='stage':
    archive=Path(a.archive)
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==a.sha256,'archive hash mismatch'
    assert not release.exists(),'release already exists; inspect before continuing'
    assert (root/'current').resolve()==previous,'current changed since preview'
    release.mkdir(mode=0o755)
    with tarfile.open(archive) as t:
        for m in t.getmembers():
            assert m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts,m.name
            f=release/m.name;f.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
            with t.extractfile(m) as src,f.open('wb') as dst:shutil.copyfileobj(src,dst)
            f.chmod(0o644)
    manifest=verify();retained=0
    # Existing clients may request their old worker or chunk after activation.
    for f in (previous/'assets').rglob('*'):
        if f.is_file() and not f.is_symlink():
            dest=release/'assets'/f.relative_to(previous/'assets')
            if not dest.exists():dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,dest);dest.chmod(0o644);retained+=1
    print(json.dumps({'staged':str(release),'identity':manifest['identity'],'verifiedFiles':len(manifest['files']),'retainedOldAssets':retained,'currentUnchanged':str((root/'current').resolve())}))
else:
    manifest=verify();current=root/'current'
    assert current.is_symlink() and current.resolve()==previous,'current changed since staging'
    pending=root/('.current-'+release.name)
    assert not pending.exists() and not pending.is_symlink()
    pending.symlink_to('releases/'+release.name);os.replace(pending,current)
    print(json.dumps({'activated':str(current.resolve()),'previous':str(previous),'identity':manifest['identity'],'verifiedFiles':len(manifest['files'])}))
