from pathlib import Path

from render_preview import Camera, RasterJob, SceneResult, ScreenFit


def job(name: str) -> RasterJob:
    camera = Camera([(0, 0, 0), (1, 1, 1)])
    return RasterJob(name, [], [], ScreenFit(camera, 1, 0, 0), 1, 1, None, {}, ())


def first(rp: Path, icon_path: Path | None) -> SceneResult:
    return SceneResult({"z-first": job("first.png"), "a-next": job("next.png")}, None)


def second(rp: Path, icon_path: Path | None) -> SceneResult:
    return SceneResult({"m-last": job("last.png")}, None)


def first_with_icon(rp: Path, icon_path: Path | None) -> SceneResult:
    return SceneResult(first(rp, icon_path).images, job(str(icon_path)))


def second_with_icon(rp: Path, icon_path: Path | None) -> SceneResult:
    return SceneResult(second(rp, icon_path).images, job(str(icon_path)))
