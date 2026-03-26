"""
TwinMe ICA Personality Decomposition
=====================================
Extracts interpretable personality axes from user memory embeddings
using Independent Component Analysis (FastICA).

Inspired by TRIBE v2 (Meta FAIR, March 2026) which uses ICA to decompose
learned brain representations into interpretable functional networks.

Usage:
    python scripts/personality_ica.py --user_id <uuid> [--n_components 20]

Output (stdout): JSON with axes, mixing vectors, top memories per axis.
Errors go to stderr. Exit code 0 on success, 1 on error.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np


def load_env():
    """Load .env from project root."""
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).resolve().parent.parent / '.env'
        load_dotenv(env_path)
    except ImportError:
        print("Warning: python-dotenv not installed, using existing env vars", file=sys.stderr)


def fetch_embeddings(user_id, limit=2000):
    """Fetch memory embeddings from Supabase."""
    from supabase import create_client

    url = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

    if not url or not key:
        return None, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"

    client = create_client(url, key)

    # Fetch in batches (Supabase has 1000-row default limit)
    all_rows = []
    batch_size = 1000
    offset = 0

    while offset < limit:
        fetch_limit = min(batch_size, limit - offset)
        result = (
            client.table('user_memories')
            .select('id, content, memory_type, embedding')
            .eq('user_id', user_id)
            .not_.is_('embedding', 'null')
            .order('created_at', desc=True)
            .range(offset, offset + fetch_limit - 1)
            .execute()
        )

        if not result.data:
            break

        all_rows.extend(result.data)
        offset += fetch_limit

        if len(result.data) < fetch_limit:
            break

    return all_rows, None


def parse_embedding(emb_raw):
    """Parse pgvector embedding string or list to numpy array."""
    if isinstance(emb_raw, list):
        return np.array(emb_raw, dtype=np.float64)
    if isinstance(emb_raw, str):
        # pgvector format: "[0.1,0.2,...]"
        cleaned = emb_raw.strip('[]')
        return np.fromstring(cleaned, sep=',', dtype=np.float64)
    return None


def run_ica(embeddings, n_components, memory_ids, memory_contents, memory_types):
    """Run FastICA on embedding matrix, return axes data."""
    from sklearn.decomposition import FastICA, PCA

    n_samples, n_features = embeddings.shape
    actual_components = min(n_components, n_samples - 1, n_features)

    # Step 1: PCA pre-reduction (1536 → 100 dims) — makes ICA tractable
    # TRIBE v2 uses the same pattern: layer compression before ICA decomposition
    PCA_TARGET_DIM = min(100, n_samples - 1, n_features)
    print(f"PCA pre-reduction: {n_features} -> {PCA_TARGET_DIM} dims", file=sys.stderr)
    pca_pre = PCA(n_components=PCA_TARGET_DIM, random_state=42)
    embeddings_reduced = pca_pre.fit_transform(embeddings)
    # Keep the PCA projection matrix to map ICA components back to full embedding space
    pca_components = pca_pre.components_  # (PCA_TARGET_DIM, 1536)

    print(f"Running FastICA: {n_samples} x {PCA_TARGET_DIM} -> {actual_components} components", file=sys.stderr)

    # Step 2: FastICA on reduced space, fall back to PCA if convergence fails
    method = 'ica'
    try:
        model = FastICA(
            n_components=actual_components,
            max_iter=500,
            random_state=42,
            whiten='unit-variance',
        )
        transformed = model.fit_transform(embeddings_reduced)  # (n_samples, n_components)
        # Map ICA mixing vectors back to original 1536-dim space
        # ica_components is (n_components, PCA_TARGET_DIM), pca_components is (PCA_TARGET_DIM, 1536)
        mixing_matrix = model.components_ @ pca_components  # (n_components, 1536)
    except Exception as e:
        print(f"FastICA failed ({e}), falling back to PCA on reduced space", file=sys.stderr)
        method = 'pca'
        model = PCA(n_components=actual_components, random_state=42)
        transformed = model.fit_transform(embeddings_reduced)
        # Map back to full space
        mixing_matrix = model.components_ @ pca_components

    # Compute variance explained per component
    if method == 'pca':
        variance_explained = model.explained_variance_ratio_.tolist()
    else:
        # For ICA, approximate variance explained by projecting data onto components
        projected = embeddings @ mixing_matrix.T
        total_var = np.var(embeddings)
        variance_explained = [
            float(np.var(projected[:, i]) / (total_var * n_features + 1e-12))
            for i in range(actual_components)
        ]

    total_variance = sum(variance_explained)

    # Build axes: for each component, find top 10 activating memories
    axes = []
    for i in range(actual_components):
        activations = np.abs(transformed[:, i])
        top_indices = np.argsort(activations)[-10:][::-1]

        axes.append({
            'axis_index': i,
            'top_memory_ids': [memory_ids[j] for j in top_indices],
            'top_memory_contents': [memory_contents[j][:200] for j in top_indices],
            'top_memory_types': [memory_types[j] for j in top_indices],
            'mixing_vector': mixing_matrix[i].tolist(),
            'variance_explained': variance_explained[i],
        })

    return {
        'axes': axes,
        'n_memories': n_samples,
        'n_components': actual_components,
        'total_variance_explained': total_variance,
        'method': method,
    }


def main():
    parser = argparse.ArgumentParser(description='TwinMe ICA Personality Decomposition')
    parser.add_argument('--user_id', required=True, help='User UUID')
    parser.add_argument('--n_components', type=int, default=20, help='Number of ICA components')
    args = parser.parse_args()

    load_env()

    # Fetch embeddings
    print(f"Fetching embeddings for user {args.user_id}...", file=sys.stderr)
    rows, err = fetch_embeddings(args.user_id)

    if err:
        json.dump({'error': 'fetch_failed', 'message': err}, sys.stdout)
        sys.exit(1)

    if not rows or len(rows) < 50:
        json.dump({
            'error': 'insufficient_memories',
            'count': len(rows) if rows else 0,
            'message': f'Need at least 50 memories with embeddings, found {len(rows) if rows else 0}',
        }, sys.stdout)
        sys.exit(1)

    # Parse embeddings into numpy matrix
    memory_ids = []
    memory_contents = []
    memory_types = []
    embedding_list = []

    for row in rows:
        emb = parse_embedding(row.get('embedding'))
        if emb is not None and len(emb) > 0:
            memory_ids.append(row['id'])
            memory_contents.append(row.get('content', ''))
            memory_types.append(row.get('memory_type', 'unknown'))
            embedding_list.append(emb)

    if len(embedding_list) < 50:
        json.dump({
            'error': 'insufficient_valid_embeddings',
            'count': len(embedding_list),
            'message': f'Only {len(embedding_list)} valid embeddings after parsing',
        }, sys.stdout)
        sys.exit(1)

    embeddings = np.vstack(embedding_list)
    print(f"Parsed {embeddings.shape[0]} embeddings of dim {embeddings.shape[1]}", file=sys.stderr)

    # Run ICA
    result = run_ica(
        embeddings,
        args.n_components,
        memory_ids,
        memory_contents,
        memory_types,
    )

    # Output JSON to stdout (ONLY valid JSON on stdout)
    json.dump(result, sys.stdout)
    print(f"\nDone: {result['n_components']} components, method={result['method']}, "
          f"variance={result['total_variance_explained']:.3f}", file=sys.stderr)


if __name__ == '__main__':
    main()
