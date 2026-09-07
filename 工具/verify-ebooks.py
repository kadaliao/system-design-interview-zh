#!/usr/bin/env python3
"""检查 EPUB 结构、元数据与内容，并把 AZW3 回转为 EPUB 验证可读取性。"""
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib,json,os,subprocess,sys,zipfile
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
ebook_dir=root/'电子书'
epub=ebook_dir/'系统设计面试笔记-中文版学习版.epub'
azw3=ebook_dir/'系统设计面试笔记-中文版学习版.azw3'
info=json.loads((ebook_dir/'构建信息.json').read_text())
calibre=Path(os.environ.get('EBOOK_CONVERT','/Applications/calibre.app/Contents/MacOS/ebook-convert'))
metadata_tool=Path(os.environ.get('EBOOK_META','/Applications/calibre.app/Contents/MacOS/ebook-meta'))
errors=[]

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inspect_epub(path, require_epub3_nav=True):
    with zipfile.ZipFile(path) as z:
        bad=z.testzip()
        if bad: errors.append(f'{path.name} ZIP CRC 错误: {bad}')
        if z.namelist()[0]!='mimetype' or z.read('mimetype')!=b'application/epub+zip':
            errors.append(f'{path.name} mimetype 条目不符合 EPUB 要求')
        container=ET.fromstring(z.read('META-INF/container.xml'))
        rootfile=container.find('.//{*}rootfile')
        if rootfile is None: raise RuntimeError('EPUB 缺少 rootfile')
        opf_name=rootfile.attrib['full-path'];opf=ET.fromstring(z.read(opf_name))
        manifest=opf.findall('.//{*}manifest/{*}item');spine=opf.findall('.//{*}spine/{*}itemref')
        nav=[i for i in manifest if 'nav' in i.attrib.get('properties','').split()]
        ncx=[i for i in manifest if i.attrib.get('media-type')=='application/x-dtbncx+xml']
        images=[i for i in manifest if i.attrib.get('media-type','').startswith('image/')]
        texts=[]
        base=Path(opf_name).parent
        for item in manifest:
            if item.attrib.get('media-type') in {'application/xhtml+xml','text/html'}:
                name=(base/Path(item.attrib['href'])).as_posix()
                try:texts.append(z.read(name).decode('utf-8',errors='replace'))
                except KeyError:errors.append(f'{path.name} 清单文件缺失: {name}')
        content='\n'.join(texts)
        required=['第 1 章','第 28 章','第 29 章','Q25-04','58 个答案条目','术语速查']
        missing=[value for value in required if value not in content]
        if missing:errors.append(f'{path.name} 缺少关键内容: {missing}')
        if require_epub3_nav and not nav:errors.append(f'{path.name} 缺少 EPUB 3 导航文档')
        if not nav and not ncx:errors.append(f'{path.name} 缺少目录导航')
        if len(spine)<30:errors.append(f'{path.name} 阅读顺序条目过少: {len(spine)}')
        if len(images)<400:errors.append(f'{path.name} 内嵌图片过少: {len(images)}')
        return {'zip_entries':len(z.namelist()),'manifest_items':len(manifest),'spine_items':len(spine),'image_items':len(images),'epub3_navigation_documents':len(nav),'ncx_navigation_documents':len(ncx),'required_content_present':not missing}

for record in info['files']:
    file=ebook_dir/record['name']
    if not file.exists():errors.append(f'缺少产物: {file.name}');continue
    if file.stat().st_size!=record['bytes'] or sha256(file)!=record['sha256']:
        errors.append(f'产物与构建信息不符: {file.name}')

metadata={}
for file in [epub,azw3]:
    result=subprocess.run([str(metadata_tool),str(file)],text=True,capture_output=True)
    metadata[file.suffix[1:]]={'readable':result.returncode==0,'title_present':'系统设计面试笔记' in result.stdout,'language_present':'zh' in result.stdout.lower()}
    if result.returncode or not metadata[file.suffix[1:]]['title_present']:
        errors.append(f'{file.name} 元数据无法读取或书名不符')

epub_report=inspect_epub(epub)
with TemporaryDirectory() as tmp:
    roundtrip=Path(tmp)/'azw3-roundtrip.epub'
    result=subprocess.run([str(calibre),str(azw3),str(roundtrip)],text=True,capture_output=True)
    if result.returncode:
        errors.append('AZW3 回转 EPUB 失败')
        roundtrip_report=None
    else:
        # AZW3 没有 EPUB 3 nav 这一概念；Calibre 回转时可能生成 EPUB 2 的 NCX 目录。
        roundtrip_report=inspect_epub(roundtrip,require_epub3_nav=False)

report={'epub':epub_report,'azw3_metadata':metadata['azw3'],'epub_metadata':metadata['epub'],'azw3_roundtrip_epub':roundtrip_report,'artifact_hashes_match':not any('构建信息不符' in e for e in errors),'errors':errors}
if '--write' in sys.argv:(root/'校验/电子书检查.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(bool(errors))
