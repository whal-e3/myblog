#!/usr/bin/env python3
"""Build a single-file map preview. Live reports still need the included local server."""
from pathlib import Path
import argparse


def build(destination: Path) -> Path:
    root = Path(__file__).resolve().parent.parent
    html = (root / "index.html").read_text(encoding="utf-8")
    assets = {
        '<script src="src/theme.js"></script>':
            '<script>\n' + (root / 'src/theme.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<link rel="stylesheet" href="src/styles.css">':
            '<style>\n' + (root / 'src/styles.css').read_text(encoding='utf-8') + '\n</style>',
        '<script src="data/network.js"></script>':
            '<script>\n' + (root / 'data/network.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<script src="data/korea.js"></script>':
            '<script>\n' + (root / 'data/korea.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<script src="data/national-rail.js"></script>':
            '<script>\n' + (root / 'data/national-rail.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<script src="data/kpop.js"></script>':
            '<script>\n' + (root / 'data/kpop.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<script src="src/trains.js"></script>':
            '<script>\n' + (root / 'src/trains.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<script src="src/live.js"></script>':
            '<script>\n' + (root / 'src/live.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<script src="src/kpop-models.js"></script>':
            '<script>\n' + (root / 'src/kpop-models.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
        '<script src="src/app.js"></script>':
            '<script>\n' + (root / 'src/app.js').read_text(encoding='utf-8').replace('</script', '<\\/script') + '\n</script>',
    }
    for marker, content in assets.items():
        if marker not in html:
            raise ValueError(f"Expected asset marker not found: {marker}")
        html = html.replace(marker, content)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(html, encoding="utf-8")
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', type=Path,
                        default=Path(__file__).resolve().parent.parent / 'dist' / 'seoul-subway-3d.html')
    args = parser.parse_args()
    result = build(args.output)
    print(f"Built {result} ({result.stat().st_size:,} bytes)")
