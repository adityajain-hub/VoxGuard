from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.orm import declarative_base, sessionmaker
import datetime
import os

BASE_DIR = os.path.dirname(__file__)
DATABASE_PATH = os.path.join(BASE_DIR, "..", "data", "database.db")
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class ScanHistory(Base):
    __tablename__ = "scan_history"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    deepfake_prob = Column(Float)
    speaker_match = Column(Float)
    action_taken = Column(String)
    timestamp = Column(String, default=lambda: datetime.datetime.now().isoformat())

Base.metadata.create_all(bind=engine)

def save_scan(filename, deepfake_prob, speaker_match, action_taken):
    db = SessionLocal()
    try:
        scan = ScanHistory(
            filename=filename,
            deepfake_prob=deepfake_prob,
            speaker_match=speaker_match,
            action_taken=action_taken
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)
        return scan
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def get_recent_scans():
    db = SessionLocal()
    try:
        scans = db.query(ScanHistory).order_by(ScanHistory.id.desc()).limit(20).all()
        return [
            {
                "id": scan.id,
                "filename": scan.filename,
                "deepfake_prob": scan.deepfake_prob,
                "speaker_match": scan.speaker_match,
                "action_taken": scan.action_taken,
                "timestamp": scan.timestamp
            }
            for scan in scans
        ]
    finally:
        db.close()
