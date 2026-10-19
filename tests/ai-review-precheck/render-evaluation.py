"""Offline synthetic cards only. No API, key lookup, student data or network."""
import hashlib
import json
import pathlib
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = pathlib.Path(__file__).resolve().parent
output = pathlib.Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
corpus_bytes = (root / 'evaluation-corpus.json').read_bytes()
corpus = json.loads(corpus_bytes)
font = ImageFont.truetype('/System/Library/Fonts/Monaco.ttf', 24)
manifest = {'synthetic': True, 'actualModelCalls': 0,
            'corpusSha256': hashlib.sha256(corpus_bytes).hexdigest(), 'images': []}
for case in corpus['cases']:
    if case['task'] != 'VISION':
        continue
    image = Image.new('RGB', (960, 240), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((24, 20), 'SYNTHETIC REVIEW - NOT A REAL STUDENT RECORD', fill='black', font=font)
    for row, line in enumerate(case['lines']):
        draw.text((24, 80 + row * 56), line, fill='black', font=font)
    # Transform the label region only; do not blur/crop the synthetic notice.
    box = (130, 76, 340, 120)
    if case['transform'] == 'BLUR_LABEL':
        image.paste(image.crop(box).filter(ImageFilter.GaussianBlur(18)), box)
    elif case['transform'] == 'CROP_LABEL':
        # Simulate a right-edge screenshot crop of the entire course value.
        # The visible top notice remains explicit in a separate row.
        draw.rectangle(box, fill='white')
        draw.text((130, 80), '[cut off]', fill='gray', font=font)
    path = output / (case['caseId'] + '.png')
    image.save(path)
    manifest['images'].append({'caseId': case['caseId'], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'syntheticImages': len(manifest['images']), 'actualModelCalls': 0}))
