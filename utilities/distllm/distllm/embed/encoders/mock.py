"""Mock encoder."""

from __future__ import annotations

import warnings
from typing import Literal

import torch
from transformers import BatchEncoding
from transformers import PreTrainedTokenizer

from distllm.utils import BaseConfig


class MockEncoderConfig(BaseConfig):
    """Config for the mock encoder."""

    # The name of the encoder
    name: Literal['mock'] = 'mock'  # type: ignore[assignment]


class MockEncoder:
    """Mock encoder."""

    def __init__(self, config: MockEncoderConfig):
        self.model = {
            'dtype': torch.float32,
            'device': 'remote',
            'config': {
                'hidden_size': 4096,
            },
        }
        pass

    @property
    def dtype(self) -> torch.dtype:
        """Get the data type of the encoder."""
        return self.model.dtype

    @property
    def device(self) -> torch.device:
        """Get the device of the encoder."""
        return self.model.device

    @property
    def embedding_size(self) -> int:
        """Get the embedding size of the encoder."""
        return self.model.config.hidden_size

    @property
    def tokenizer(self) -> PreTrainedTokenizer:
        """Get the tokenizer of the encoder."""
        return None

    def encode(self, batch_encoding: BatchEncoding) -> torch.Tensor:
        """Encode the sequence.

        Parameters
        ----------
        batch_encoding : BatchEncoding
            The batch encoding of the sequence (containing the input_ids,
            attention_mask, and token_type_ids).

        Returns
        -------
        torch.Tensor
            The embeddings of the sequence extracted from the last hidden state
            (shape: [num_sequences, sequence_length, embedding_size])
        """
        
        return None
