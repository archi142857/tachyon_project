"""학과별 전공 과목 목록을 서울대 공식 PDF '전공별 교과목(학사과정)'에서 뽑는다.

    python scripts/build_departments.py <Undergraduate_Course_List_2024.pdf>

PDF는 저장소에 넣지 않는다(주소는 data/departments/README.md). poppler의 pdftotext가 있어야 한다.
흐름: 쪽마다 왼쪽·오른쪽 단을 따로 글자로 뽑는다 → '4190. 컴퓨터공학부' 같은 제목 줄에서 학과가 바뀐다
     → '4190.101* 이산수학(Discrete Mathematics) 3－3－0' 같은 줄을 과목 하나로 읽는다.
끝에 data/offerings(수강편람)와 맞춰 본 숫자를 찍는다.
"""
import datetime
import glob
import json
import re
import subprocess
import sys

SOURCE = 'https://www.snu.ac.kr/webdata/uploads/kor/file/2025/04/Undergraduate_Course_List_2024.pdf'
OUT = 'data/departments/courses_2024.json'
HALF = 298  # A4 너비 595pt의 절반: 두 단의 경계

NUMBER = r'(?:\d{3,4}[A-Z]?\.\d{3,4}[A-Z]?|[A-Z]\d{3,4}\.\d{6})'
COURSE = re.compile(rf'^\s*({NUMBER})\s*([*＊]{{0,2}})\s*(\S.*)$')
CREDITS = re.compile(r'(\d+)\s*[－\-—ㅡ–―]\s*(\d+)\s*[－\-—ㅡ–―]\s*(\d+)')  # 학점－강의－실습
HEADING = re.compile(r'^\s*(\d{3,5}[A-Z]?)\. ?([가-힣])')
MARK = {'': '', '*': '필수', '**': '선택필수'}


def pdf_text(pdf, *options):
    return subprocess.run(['pdftotext', '-layout', *options, pdf, '-'], capture_output=True, text=True, check=True).stdout


def heading_name(code, whole):
    """제목은 단 경계에서 잘릴 수 있어서, 이름은 쪽 전체를 뽑은 글에서 다시 찾는다(쪽 머리글에도 같은 이름이 있다)."""
    m = re.search(rf'(?<![\d.A-Z]){code}\. ?(?=[가-힣])([^\n]*?)\s*(?:\((?=[A-Z])|\s{{3,}}|$)', whole, re.M)
    return re.sub(r'\s+', ' ', m.group(1)).strip() if m else None


def parse(pdf):
    whole_pages = pdf_text(pdf).split('\f')[:-1]
    whole = '\n'.join(whole_pages)
    departments, section, current = [], None, None
    for page, page_text in enumerate(whole_pages, 1):
        # 쪽 머리글: '학사과정   공과대학   4190. 컴퓨터공학부'. 가운데가 단과대(뒤쪽은 연합·연계전공, 교직과목 …)
        header = re.split(r'\s{2,}', next((l for l in page_text.split('\n') if l.strip()), '').strip())
        here = header[1] if len(header) > 1 else None
        if here != section:
            section = here
            current = None
            if here and not HEADING.match(here):  # 학과 제목 없이 시작하는 묶음(공과대학 공통과목, 교직과목 …)
                current = {'code': '', 'name': here, 'college': here, 'page': page, 'courses': []}
                departments.append(current)
        college = '연합·연계전공' if section and HEADING.match(section) else section
        for x in (0, HALF):
            lines = pdf_text(pdf, '-f', str(page), '-l', str(page), '-x', str(x), '-y', '0', '-W', str(HALF), '-H', '842').split('\n')
            i = 0
            while i < len(lines):
                line = lines[i]
                i += 1
                head = HEADING.match(line)
                if head and not CREDITS.search(line):
                    code = head.group(1)
                    name = heading_name(code, whole)
                    if not name or (current and current['code'] == code):
                        continue  # 같은 제목이 쪽마다 되풀이됨
                    if name == college and current and not current['code']:
                        current['code'] = code  # '400. 공과대학' 제목: 그 아래는 단과대 공통과목
                        continue
                    current = {'code': code, 'name': name, 'college': college, 'page': page, 'courses': []}
                    departments.append(current)
                    continue
                start = COURSE.match(line)
                if not (start and current):
                    continue
                number, stars, text = start.groups()
                # 과목명이 길면 학점(3－3－0)이 다음 줄로 넘어간다. 3줄 안에 학점이 없으면 표 안의 줄이라 버린다.
                extra = 0
                while (not CREDITS.search(text) and extra < 3 and i < len(lines) and lines[i].strip()
                       and not COURSE.match(lines[i]) and not HEADING.match(lines[i])):
                    text += ' ' + lines[i].strip()
                    i += 1
                    extra += 1
                credit = CREDITS.search(text)
                if not credit:
                    continue
                # 과목명 = 영어 이름 괄호 앞까지. '과목명*'처럼 별이 이름 뒤에 붙은 줄도 있다.
                name = re.split(r'\s*[({\[](?=[^)가-힣]*(?:\)|$))', text[:credit.start()])[0]
                name = re.sub(r'\s+', ' ', name).strip()
                if name.endswith('*'):
                    stars, name = stars or re.search(r'\*+$', name).group(), name.rstrip('* ')
                if name and number not in {c[0] for c in current['courses']}:
                    current['courses'].append([number, name, int(credit.group(1)), MARK[stars.replace('＊', '*')]])
    return [d for d in departments if d['courses']]


def check(departments):
    """수강편람(data/offerings)과 맞춰 본다. 2024년판 문서가 지금도 맞는지 보는 유일한 최신 자료다.
    과목마다 가장 최근에 열린 학기의 과목명·학점·이수구분과 견주고, 어긋난 것은 check_recent.json에 남긴다."""
    latest = {}
    for path in sorted(glob.glob('data/offerings/*.json')):
        semester = path.split('/')[-1][:-5]
        for number, name, dept, credit, kind, *_ in json.load(open(path))['courses']:
            latest[number] = (semester, name, dept, credit, kind)
    squeeze = lambda text: re.sub(r'[\s·ㆍ⋅]+', '', text)
    listed = {c[0]: (d['name'], c) for d in reversed(departments) for c in d['courses']}
    found = [(c, latest[n]) for n, (_d, c) in listed.items() if n in latest]
    same_name = sum(squeeze(c[1]) == squeeze(o[1]) for c, o in found)
    same_credit = sum(c[2] == o[3] for c, o in found)
    since = '2025-1'  # 문서(2024년판) 뒤에 열린 학기만: 그 사이 바뀐 것을 찾는다
    majors = {n: o for n, o in latest.items() if o[0] >= since and o[4] in ('전필', '전선')}
    row = lambda n, o: {'number': n, 'name': o[1], 'dept': o[2], 'semester': o[0], 'offered_as': o[4]}
    report = {
        'meta': {'built_on': datetime.date.today().isoformat(), 'compared_with': f'data/offerings {since} ~ {max(o[0] for o in latest.values())}',
                 'note': '수강편람의 이수구분은 개설 학과 기준이라 다른 학과 학생에게는 다를 수 있다. 어긋난 줄은 사람이 학과 내규로 확인한다.'},
        'required_now_but_not_marked': [row(n, o) for n, o in majors.items() if o[4] == '전필' and n in listed and listed[n][1][3] != '필수'],
        'marked_required_but_elective_now': [row(n, o) for n, o in majors.items() if o[4] == '전선' and n in listed and listed[n][1][3] == '필수'],
        'renamed': [dict(row(n, o), listed_name=listed[n][1][1]) for n, o in majors.items() if n in listed and squeeze(o[1]) != squeeze(listed[n][1][1])],
        'not_in_2024_list': [row(n, o) for n, o in majors.items() if n not in listed],
    }
    json.dump(report, open('data/departments/check_recent.json', 'w'), ensure_ascii=False, indent=1)
    rows = sum(len(d['courses']) for d in departments)
    print(f'학과·전공 {len(departments)}묶음, 과목 {rows}개(번호 기준 {len(listed)}개)')
    print(f'수강편람에 번호가 있는 과목 {len(found)}개 (과목명 같음 {same_name}, 학점 같음 {same_credit})')
    print(f"{since} 뒤 열린 전공 과목 {len(majors)}개: 문서에 있음 {sum(n in listed for n in majors)}, "
          + ', '.join(f'{k} {len(v)}' for k, v in report.items() if k != 'meta'))
    assert len(departments) > 80 and rows > 3000 and same_name > len(found) * 0.9


if __name__ == '__main__':
    result = parse(sys.argv[1])
    check(result)
    json.dump({
        'meta': {
            'edition': '2024', 'source': SOURCE, 'built_on': datetime.date.today().isoformat(),
            'columns': ['교과목번호', '과목명', '학점', '표시(필수·선택필수는 그 학과 이수규정의 * · ** 뜻을 따른다)'],
            'page': 'PDF 쪽 번호(그 학과가 시작하는 쪽)',
        },
        'departments': result,
    }, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('→', OUT)
