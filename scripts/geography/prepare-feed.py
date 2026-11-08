from pathlib import Path
from datetime import date
from collections import Counter
import os
src=Path(os.environ["AF_GEO_WORKDIR"])
def clean(s):
 return str(s).replace('\t',' ').replace('\r',' ').replace('\n',' ').replace('\\',' ')
def load(f):
 for l in (src/f).read_text(encoding='utf-8').splitlines():
  if l.startswith('#') or not l.strip():continue
  yield l.split('\t')
countries={};regions={}
with (src/'countries.tsv').open('w') as f:
 for cols in load('countryInfo.txt'):
  if len(cols)<17 or len(cols[0])!=2 or not cols[16].isdigit():continue
  cc=cols[0].upper(); countries[cc]=(clean(cols[4]),int(cols[16]));f.write(f'{cc}\t{clean(cols[4])}\t{cols[16]}\n')
with (src/'regions.tsv').open('w') as f:
 for cols in load('admin1CodesASCII.txt'):
  if len(cols)<4 or not cols[3].isdigit():continue
  ids=cols[0].split('.')
  if len(ids)!=2 or ids[0] not in countries:continue
  cc,regionCode=ids;name=clean(cols[1]);regions[(cc,regionCode)]=(name,int(cols[3]));f.write('\t'.join(map(str,[cols[3],cc,countries[cc][1],name,clean(cols[2]),regionCode,f'{name} · {countries[cc][0]}']))+'\n')
with (src/'districts.tsv').open('w') as f:
 for cols in load('admin2Codes.txt'):
  if len(cols)<4 or not cols[3].isdigit():continue
  codes=cols[0].split('.')
  if len(codes)!=3 or codes[0] not in countries:continue
  cc,adm1,adm2=codes;parent=regions.get((cc,adm1));name=clean(cols[1]);region=parent[0] if parent else None
  f.write('\t'.join(map(str,[cols[3],cc,parent[1] if parent else '\\N',name,clean(cols[2]),adm1,adm2,f'{name} · {region} · {countries[cc][0]}' if region else f'{name} · {countries[cc][0]}']))+'\n')
print('Feed prepared countries',len(countries),'regions',len(regions),'districts',sum(1 for _ in open(src/'districts.tsv')))
