import argparse
import hashlib
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

VERSION = re.compile(r"v[0-9]+\.[0-9]+\.[0-9]+")
IMAGE = re.compile(r"([a-z0-9][a-z0-9./:_-]+)@(sha256:[a-f0-9]{64})")
IMAGE_NAMES = ("daily-planner-web", "daily-planner-api", "markdown-viewer")
ROOT = Path(__file__).resolve().parents[2]


def package_release(version: str, output: Path, references: list[str]) -> Path:
    if not VERSION.fullmatch(version):
        raise ValueError("Use a release version in the form vMAJOR.MINOR.PATCH.")
    images = []
    for name, reference in zip(IMAGE_NAMES, references, strict=True):
        match = IMAGE.fullmatch(reference)
        if not match or "/" not in match[1]:
            raise ValueError(
                f"{name} requires a registry image pinned to a SHA-256 digest."
            )
        images.append(
            f"  - name: {name}\n    newName: {match[1]}\n    digest: {match[2]}"
        )

    archive_name = f"day-planner-k3s-{version}"
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"{archive_name}.tar.gz"
    with tempfile.TemporaryDirectory() as temp:
        package = Path(temp) / archive_name
        overlay = package / "deploy/k3s-overlays/example"
        shutil.copytree(
            ROOT / "deploy/k3s",
            package / "deploy/k3s",
            ignore=shutil.ignore_patterns("package-release.py", "__pycache__"),
        )
        shutil.copytree(ROOT / "deploy/k3s-overlays/example", overlay)
        shutil.copy2(ROOT / "justfile", package / "justfile")
        shutil.copy2(ROOT / ".gitignore", package / ".gitignore")
        template = overlay / "kustomization.yaml"
        prefix, rest = template.read_text().split("images:\n", 1)
        _, patches = rest.split("\npatches:", 1)
        template.write_text(
            f"{prefix}images:\n" + "\n".join(images) + f"\n\npatches:{patches}"
        )

        rendered = subprocess.check_output(
            ["kubectl", "kustomize", str(overlay)], text=True
        )
        for reference in references:
            if f"image: {reference}" not in rendered:
                raise ValueError(
                    f"Rendered deployment is missing the pinned image {reference}."
                )
        if re.search(r"^kind: Secret$", rendered, flags=re.MULTILINE):
            raise ValueError("Release archives must not include Kubernetes secrets.")

        with tarfile.open(archive, "w:gz") as tar:
            tar.add(package, arcname=archive_name)

    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".gz.sha256").write_text(f"{digest}  {archive.name}\n")
    return archive


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a digest-pinned k3s release archive."
    )
    parser.add_argument("version")
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "images", nargs=3, metavar="IMAGE@DIGEST", help="Web, API, and Viewer images"
    )
    args = parser.parse_args()
    print(package_release(args.version, args.output, args.images))


if __name__ == "__main__":
    main()
