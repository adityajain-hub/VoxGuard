from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime
import os

DATABASE_URL = "sqlite:///../data/database.db"

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
    scan = ScanHistory(
        filename=filename,
        deepfake_prob=deepfake_prob,
        speaker_match=speaker_match,
        action_taken=action_taken
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    db.close()
    return scan

def get_recent_scans():
    db = SessionLocal()
    scans = db.query(ScanHistory).order_by(ScanHistory.id.desc()).limit(20).all()
    db.close()
    return scans

