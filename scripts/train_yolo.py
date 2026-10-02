from pathlib import Path
import shutil

from ultralytics import YOLO

root = Path(__file__).resolve().parent.parent
model = YOLO("yolo11n.pt")
names = model.names  # COCO 80 クラス（car は 2）

# 80 クラスのまま微調整する（出力形状 [1, 84, 2100] を変えないため）
yaml = root / "dataset" / "data.yaml"
lines = [f"path: {(root / 'dataset').as_posix()}", "train: images/train", "val: images/val", "names:"]
lines += [f"  {i}: {n}" for i, n in names.items()]
yaml.write_text("\n".join(lines) + "\n", encoding="utf-8")

model.train(
    data=str(yaml), imgsz=320, epochs=25, batch=32, device="cpu", workers=2,
    patience=10, project=str(root / "runs"), name="jev", exist_ok=True,
    fliplr=0.5, mosaic=1.0, plots=False,
)

best = root / "runs" / "jev" / "weights" / "best.pt"
exported = YOLO(str(best)).export(format="onnx", imgsz=320, opset=12)
dst = root / "public" / "models" / "yolo11n-jev.onnx"
shutil.copy(exported, dst)
print("出力:", dst)
