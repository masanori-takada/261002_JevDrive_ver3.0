from pathlib import Path
import os
import shutil
import sys

from ultralytics import YOLO

root = Path(__file__).resolve().parent.parent
# 入力サイズは環境変数 YOLO_IMGSZ（既定 320）、データ置き場は DATASET_DIR（既定 dataset）、
# 出力 ONNX のファイル名は第 1 引数（既定 yolo11n-jev.onnx）で切り替える
imgsz = int(os.environ.get("YOLO_IMGSZ", "320"))
ds_name = os.environ.get("DATASET_DIR", "dataset")
out_name = sys.argv[1] if len(sys.argv) > 1 else "yolo11n-jev.onnx"
run_name = "jev" if imgsz == 320 else f"jev{imgsz}"
model = YOLO("yolo11n.pt")
names = model.names  # COCO 80 クラス（car は 2）

# 80 クラスのまま微調整する（出力形状 [1, 84, n] の形を変えないため）
yaml = root / ds_name / "data.yaml"
lines = [f"path: {(root / ds_name).as_posix()}", "train: images/train", "val: images/val", "names:"]
lines += [f"  {i}: {n}" for i, n in names.items()]
yaml.write_text("\n".join(lines) + "\n", encoding="utf-8")

model.train(
    data=str(yaml), imgsz=imgsz, epochs=25, batch=32, device="cpu", workers=2,
    patience=10, project=str(root / "runs"), name=run_name, exist_ok=True,
    fliplr=0.5, mosaic=1.0, plots=False,
)

best = root / "runs" / run_name / "weights" / "best.pt"
exported = YOLO(str(best)).export(format="onnx", imgsz=imgsz, opset=12)
dst = root / "public" / "models" / out_name
shutil.copy(exported, dst)
print("出力:", dst)
