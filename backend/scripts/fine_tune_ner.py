"""
AutoIntel — BERT NER Fine-Tuning Script
========================================
Run this in Google Colab (T4 GPU recommended).

Strategy: Use the jjzha/skillspan dataset from HuggingFace which is a
well-maintained, English, IOB2-format dataset for skill extraction from
job postings and resumes. It has 11,600+ rows with proper train/test splits.

Steps:
  1. Install dependencies
  2. Load jjzha/skillspan dataset
  3. Fine-tune yashpwr/resume-ner-bert-v2
  4. Evaluate (F1 score)
  5. Save model to fine_tuned_ner/

After running:
  - Download fine_tuned_ner/ folder
  - Place it in backend/ of your project
  - resume_parser.py will auto-detect and use it
"""

# ============================================================
# CELL 1 — Install dependencies
# ============================================================
# Run this cell first, then restart runtime if prompted

import subprocess
subprocess.run(["pip", "install", "-q", "transformers", "datasets", "seqeval", "accelerate"], check=True)
print("Dependencies installed.")


# ============================================================
# CELL 2 — Load dataset
# ============================================================

from datasets import load_dataset
import json

print("Loading jjzha/skillspan dataset...")
# This is a clean, English, IOB2 NER dataset for skill extraction
# 8,000 train rows + 3,500 test rows — no broken files
dataset = load_dataset("jjzha/skillspan")
print(dataset)

# Inspect labels
print("\nLabel names:", dataset["train"].features["labels"].feature.names)
print("\nSample entry:")
sample = dataset["train"][0]
for tok, lbl in zip(sample["tokens"][:10], sample["labels"][:10]):
    label_name = dataset["train"].features["labels"].feature.int2str(lbl)
    print(f"  {tok:<20} {label_name}")


# ============================================================
# CELL 3 — Load base model and tokenizer
# ============================================================

from transformers import AutoTokenizer, AutoModelForTokenClassification
import torch

BASE_MODEL = "yashpwr/resume-ner-bert-v2"
OUTPUT_DIR = "./fine_tuned_ner"

# Get label info from dataset
label_names = dataset["train"].features["labels"].feature.names
num_labels = len(label_names)
id2label = {i: l for i, l in enumerate(label_names)}
label2id = {l: i for i, l in enumerate(label_names)}

print(f"Labels ({num_labels}): {label_names}")
print(f"\nLoading tokenizer from {BASE_MODEL}...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

print(f"Loading model from {BASE_MODEL}...")
model = AutoModelForTokenClassification.from_pretrained(
    BASE_MODEL,
    num_labels=num_labels,
    id2label=id2label,
    label2id=label2id,
    ignore_mismatched_sizes=True,
)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"\nDevice: {device}")
if device == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")
else:
    print("WARNING: No GPU detected. Training will be slow. Go to Runtime > Change runtime type > T4 GPU")

model = model.to(device)
print("Model loaded!")


# ============================================================
# CELL 4 — Tokenize and align labels
# ============================================================

def tokenize_and_align_labels(examples):
    """
    Tokenize word-level tokens and align IOB2 labels to BERT subword tokens.
    - First subword of a word gets the word's label
    - Continuation subwords get -100 (ignored in loss)
    - Special tokens [CLS][SEP][PAD] get -100
    """
    tokenized = tokenizer(
        examples["tokens"],
        truncation=True,
        max_length=512,
        is_split_into_words=True,
        padding="max_length",
    )

    all_labels = []
    for i, word_labels in enumerate(examples["labels"]):
        word_ids = tokenized.word_ids(batch_index=i)
        aligned = []
        prev_word_id = None
        for word_id in word_ids:
            if word_id is None:
                aligned.append(-100)
            elif word_id != prev_word_id:
                aligned.append(word_labels[word_id])
            else:
                aligned.append(-100)
            prev_word_id = word_id
        all_labels.append(aligned)

    tokenized["labels"] = all_labels
    return tokenized


print("Tokenizing train split...")
train_dataset = dataset["train"].map(
    tokenize_and_align_labels,
    batched=True,
    batch_size=64,
    remove_columns=dataset["train"].column_names,
)

print("Tokenizing test split...")
eval_dataset = dataset["test"].map(
    tokenize_and_align_labels,
    batched=True,
    batch_size=64,
    remove_columns=dataset["test"].column_names,
)

train_dataset.set_format("torch")
eval_dataset.set_format("torch")

print(f"Train: {len(train_dataset)} samples")
print(f"Eval:  {len(eval_dataset)} samples")
print("Tokenization complete!")


# ============================================================
# CELL 5 — Evaluation metric
# ============================================================

import numpy as np
from seqeval.metrics import f1_score, precision_score, recall_score

def compute_metrics(eval_preds):
    logits, labels = eval_preds
    predictions = np.argmax(logits, axis=-1)

    true_labels, true_preds = [], []
    for pred_seq, label_seq in zip(predictions, labels):
        tl, tp = [], []
        for p, l in zip(pred_seq, label_seq):
            if l != -100:
                tl.append(id2label[l])
                tp.append(id2label[p])
        true_labels.append(tl)
        true_preds.append(tp)

    return {
        "f1":        f1_score(true_labels, true_preds),
        "precision": precision_score(true_labels, true_preds),
        "recall":    recall_score(true_labels, true_preds),
    }

print("Evaluation metric defined.")


# ============================================================
# CELL 6 — Train
# ============================================================

from transformers import TrainingArguments, Trainer, DataCollatorForTokenClassification

data_collator = DataCollatorForTokenClassification(tokenizer)

training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=4,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=16,
    learning_rate=2e-5,
    weight_decay=0.01,
    warmup_ratio=0.1,
    lr_scheduler_type="linear",
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    greater_is_better=True,
    logging_steps=50,
    fp16=torch.cuda.is_available(),
    report_to="none",
    push_to_hub=False,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    tokenizer=tokenizer,
    data_collator=data_collator,
    compute_metrics=compute_metrics,
)

print("=" * 60)
print("Starting fine-tuning...")
print(f"  Base model:  {BASE_MODEL}")
print(f"  Dataset:     jjzha/skillspan ({len(train_dataset)} train samples)")
print(f"  Epochs:      {training_args.num_train_epochs}")
print(f"  Batch size:  {training_args.per_device_train_batch_size}")
print(f"  Device:      {device}")
print("=" * 60)

trainer.train()
print("\nTraining complete!")


# ============================================================
# CELL 7 — Evaluate
# ============================================================

print("Evaluating fine-tuned model...")
results = trainer.evaluate()

print("\n" + "=" * 60)
print("RESULTS")
print("=" * 60)
print(f"  F1 Score:  {results['eval_f1']:.4f}")
print(f"  Precision: {results['eval_precision']:.4f}")
print(f"  Recall:    {results['eval_recall']:.4f}")
print(f"  Loss:      {results['eval_loss']:.4f}")
print("=" * 60)


# ============================================================
# CELL 8 — Save model
# ============================================================

import os

os.makedirs(OUTPUT_DIR, exist_ok=True)
trainer.save_model(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

# Save metadata for thesis documentation
metadata = {
    "base_model": BASE_MODEL,
    "dataset": "jjzha/skillspan",
    "dataset_size": len(train_dataset),
    "epochs": training_args.num_train_epochs,
    "learning_rate": training_args.learning_rate,
    "batch_size": training_args.per_device_train_batch_size,
    "label_list": label_names,
    "eval_f1": round(results["eval_f1"], 4),
    "eval_precision": round(results["eval_precision"], 4),
    "eval_recall": round(results["eval_recall"], 4),
}

with open(os.path.join(OUTPUT_DIR, "training_metadata.json"), "w") as f:
    json.dump(metadata, f, indent=2)

print(f"Model saved to: {OUTPUT_DIR}")
print("Files:")
for fname in os.listdir(OUTPUT_DIR):
    size_mb = os.path.getsize(os.path.join(OUTPUT_DIR, fname)) / 1024 / 1024
    print(f"  {fname}  ({size_mb:.1f} MB)")


# ============================================================
# CELL 9 — Quick inference test
# ============================================================

from transformers import pipeline

ner_pipe = pipeline(
    "ner",
    model=OUTPUT_DIR,
    tokenizer=OUTPUT_DIR,
    aggregation_strategy="simple",
    device=0 if torch.cuda.is_available() else -1,
)

test_text = (
    "John dela Cruz is a Software Engineer with 3 years of experience. "
    "Skills: Python, React, Node.js, PostgreSQL, Docker, AWS. "
    "Bachelor of Science in Computer Science from De La Salle University. "
    "Worked at Accenture Philippines as a Full Stack Developer."
)

print("Testing on sample resume text:")
print("-" * 60)
entities = ner_pipe(test_text)
print(f"Entities found: {len(entities)}")
for ent in entities:
    print(f"  [{ent['entity_group']}]  '{ent['word']}'  (score: {ent['score']:.3f})")


# ============================================================
# CELL 10 — Download model (Colab only)
# ============================================================

import shutil

zip_path = "fine_tuned_ner.zip"
shutil.make_archive("fine_tuned_ner", "zip", ".", "fine_tuned_ner")
print(f"Zipped: {zip_path}")

try:
    from google.colab import files
    files.download(zip_path)
    print("Download started!")
    print("\nNext steps:")
    print("  1. Unzip fine_tuned_ner.zip")
    print("  2. Place fine_tuned_ner/ folder inside backend/ in your project")
    print("  3. resume_parser.py will auto-detect and use it")
except ImportError:
    print(f"Not running in Colab. Model is saved at: {OUTPUT_DIR}")
