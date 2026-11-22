#!/usr/bin/env python3
"""Lossless ZIP-entry transport deduplication for a disposable static build.

Original web files are immutable. Every original byte (local headers, compressed
payload, descriptors, central directory, comments) is preserved by ordered slices.
Only ZIPs in the separate client build are removed, after full SHA verification.
"""
from __future__ import annotations
import argparse,hashlib,json,shutil,struct,tempfile,zipfile
from pathlib import Path

PACK_BYTES=4*1024*1024
def digest(data):return hashlib.sha256(data).hexdigest()

def zip_segments(path:Path):
 data=path.read_bytes()
 with zipfile.ZipFile(path) as z:
  entries=sorted(z.infolist(),key=lambda item:item.header_offset)
 cursor=0
 for entry in entries:
  at=entry.header_offset
  if at<cursor or at+30>len(data) or data[at:at+4]!=b'PK\x03\x04':raise ValueError(f'Invalid local ZIP record: {path.name}')
  name_length,extra_length=struct.unpack_from('<HH',data,at+26)
  payload=at+30+name_length+extra_length;end=payload+entry.compress_size
  if payload>len(data) or end>len(data):raise ValueError(f'Invalid ZIP payload length: {path.name}')
  if cursor<payload:yield 'metadata',data[cursor:payload]
  if payload<end:yield 'payload',data[payload:end]
  cursor=end
 if cursor<len(data):yield 'metadata',data[cursor:]

def pack_archives(source,client,report_path=None):
 source=Path(source).resolve();client=Path(client).resolve()
 if source==client or source in client.parents or client in source.parents:raise ValueError('Source and disposable client must be separate directories')
 if not source.is_dir() or not client.is_dir():raise ValueError('Both directories must already exist')
 archives=sorted(source.rglob('*.zip'))
 if any(p.is_symlink() for p in archives):raise ValueError('Archive source must not be a symlink')
 originals={p.relative_to(source).as_posix():{'sha256':digest(p.read_bytes()),'bytes':p.stat().st_size}for p in archives}
 for relative,item in originals.items():
  staged=client/relative
  if staged.exists() and (not staged.is_file() or staged.is_symlink() or digest(staged.read_bytes())!=item['sha256']):raise ValueError(f'Client copy differs from source: {relative}')
 staging=Path(tempfile.mkdtemp(prefix='_crf-archives-pending-',dir=client))
 chunks={};archive_chunks={};pack_buffers=[];buffer=bytearray();raw_segment_count=0;deduplicated_bytes=0;payload_bytes=0;metadata_bytes=0
 def store_piece(piece):
  nonlocal buffer,deduplicated_bytes
  sha=digest(piece)
  if sha in chunks:
   old=chunks[sha]
   if old[2]!=len(piece):raise ValueError('Chunk hash collision')
   deduplicated_bytes+=len(piece);return old
  if len(buffer)+len(piece)>PACK_BYTES:
   pack_buffers.append(bytes(buffer));buffer=bytearray()
  loc=(len(pack_buffers),len(buffer),len(piece));buffer.extend(piece);chunks[sha]=loc;return loc
 try:
  for p in archives:
   sequence=[]
   for kind,segment in zip_segments(p):
    raw_segment_count+=1
    if kind=='payload':payload_bytes+=len(segment)
    else:metadata_bytes+=len(segment)
    for start in range(0,len(segment),PACK_BYTES):sequence.append(store_piece(segment[start:start+PACK_BYTES]))
   archive_chunks[p.relative_to(source).as_posix()]=sequence
  if buffer:pack_buffers.append(bytes(buffer))
  names=[];packs={}
  for index,data in enumerate(pack_buffers):
   sha=digest(data);name=f'pack-{index:04d}-{sha[:16]}.bin';(staging/name).write_bytes(data)
   url='/_crf-archives/'+name;names.append(url);packs[url]={'bytes':len(data),'sha256':sha}
  files={}
  for relative,sequence in archive_chunks.items():
   original=originals[relative];sha=hashlib.sha256();size=0
   for pack,offset,length in sequence:chunk=pack_buffers[pack][offset:offset+length];sha.update(chunk);size+=len(chunk)
   if size!=original['bytes'] or sha.hexdigest()!=original['sha256']:raise ValueError(f'Reconstruction mismatch: {relative}')
   if digest((source/relative).read_bytes())!=original['sha256']:raise ValueError(f'Source changed during packing: {relative}')
   files['/'+relative]={**original,'mime':'application/zip','segments':[[names[p],o,n]for p,o,n in sequence]}
  manifest={'schema':'crf.packed_archives.v0.9','packBytes':PACK_BYTES,'files':files,'packs':packs}
  destination=client/'_crf-archives'
  if destination.exists():shutil.rmtree(destination)
  staging.rename(destination)
  removed=0
  for relative in originals:
   staged=client/relative
   if staged.exists():staged.unlink();removed+=1
  result={'manifest':manifest,'stats':{'archiveCount':len(files),'originalBytes':sum(x['bytes']for x in originals.values()),'storedBytes':sum(len(x)for x in pack_buffers),'savedBytes':deduplicated_bytes,'rawZipSegments':raw_segment_count,'uniqueChunks':len(chunks),'packFiles':len(packs),'maxPackBytes':max((len(x)for x in pack_buffers),default=0),'payloadBytes':payload_bytes,'metadataBytes':metadata_bytes,'removedDisposableCopies':removed,'sourcePreserved':True,'allArchivesByteExact':True}}
  if report_path:
   report_path=Path(report_path);report_path.parent.mkdir(parents=True,exist_ok=True);report_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
  return result
 except BaseException:
  if staging.exists():shutil.rmtree(staging)
  raise

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--client',required=True);parser.add_argument('--report',required=True);a=parser.parse_args()
 result=pack_archives(a.source,a.client,a.report);print(json.dumps({'report':str(Path(a.report).resolve()),**result['stats']}))
