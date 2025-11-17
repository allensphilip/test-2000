import traceback

from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import os
import torch
import nemo.collections.asr as nemo_asr
from omegaconf import DictConfig
import tempfile
import logging
import time
from werkzeug.utils import secure_filename
import librosa
import soundfile as sf
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'ogg', 'm4a', 'webm'}
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file size

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


class NeMoASRModel:
    def __init__(self, model_path, decoding_strategy='beam', beam_size=4, lm_path=None):
        self.model_path = model_path
        self.lm_path = lm_path  # Path to language model binary file
        self.model = None
        self.initialized = False
        self.model_name = "Custom NeMo RNNT Model"
        self.decoding_strategy = decoding_strategy
        self.beam_size = beam_size
        self.initialize_model()
        self.debug_model_capabilities()

    def debug_model_capabilities(self):
        """Debug what decoding options your model actually supports"""
        try:
            print("=== MODEL DEBUG INFO ===")
            print(f"Model type: {type(self.model)}")
            print(f"Model class: {self.model.__class__.__name__}")

            # Check if model has decoding config
            if hasattr(self.model, 'cfg') and hasattr(self.model.cfg, 'decoding'):
                print(f"Current decoding config: {self.model.cfg.decoding}")

            # Check what methods are available
            decoding_methods = [method for method in dir(self.model) if 'decoding' in method.lower()]
            print(f"Available decoding methods: {decoding_methods}")

            # Try to get the current decoding strategy
            if hasattr(self.model, 'decoding'):
                print(f"Current decoding object: {self.model.decoding}")
                if hasattr(self.model.decoding, 'cfg'):
                    print(f"Decoding config: {self.model.decoding.cfg}")

            # Check if it's an RNNT model (different config structure)
            if 'rnnt' in str(type(self.model)).lower():
                print("This appears to be an RNNT model - different config needed")

            print("=== END DEBUG INFO ===")

        except Exception as e:
            print(f"Debug failed: {e}")

    def verify_lm_loading(self):
        """Verify if the language model is actually being loaded and used"""
        try:
            print("=== LANGUAGE MODEL DEBUG ===")

            # Check if KenLM file exists
            lm_path = "/Users/harsol/Carasent/GIT/medsum-stream/parakeet/model/kenlm-medical-h-encoded.binary"
            print(f"KenLM file exists: {os.path.exists(lm_path)}")

            if os.path.exists(lm_path):
                file_size = os.path.getsize(lm_path)
                print(f"KenLM file size: {file_size} bytes ({file_size / (1024 * 1024):.2f} MB)")

            # Check current decoding config
            if hasattr(self.model.decoding, 'cfg'):
                beam_cfg = self.model.decoding.cfg.get('beam', {})
                print(f"Current beam config:")
                print(f"  - beam_size: {beam_cfg.get('beam_size')}")
                print(f"  - beam_alpha: {beam_cfg.get('beam_alpha')}")
                print(f"  - beam_beta: {beam_cfg.get('beam_beta')}")
                print(f"  - kenlm_path: {beam_cfg.get('kenlm_path')}")

                # Check if LM is actually loaded
                if hasattr(self.model.decoding, 'kenlm'):
                    print(f"KenLM object loaded: {self.model.decoding.kenlm is not None}")

            print("=== END LM DEBUG ===")

        except Exception as e:
            print(f"LM debug failed: {e}")

    # Usage examples:
    def apply_beam_with_lm(self):
        """Apply beam search with language model"""
        lm_path = "/Users/harsol/Carasent/GIT/medsum-stream/parakeet/model/kenlm-medical-h-encoded.binary"

        with_lm_cfg = DictConfig({
            'strategy': 'beam',
            'beam': {
                'beam_size': 100,
                'beam_alpha': 1.0,
                'beam_beta': 1.0,
                'kenlm_path': lm_path,
                'return_best_hypothesis': True
            }
        })

        self.model.change_decoding_strategy(with_lm_cfg)
        self.verify_lm_loading()
        logger.info("Applied beam search WITH language model")

    def apply_beam_without_lm(self):
        """Apply beam search without language model"""
        without_lm_cfg = DictConfig({
            'strategy': 'beam',
            'beam': {
                'beam_size': 50,
                'beam_alpha': 1.0,
                'beam_beta': 1.0,
                'kenlm_path': None,
                'return_best_hypothesis': True
            }
        })

        self.model.change_decoding_strategy(without_lm_cfg)
        logger.info("Applied beam search WITHOUT language model")

    def set_decoding_strategy(self, strategy='beam', beam_size=4, lm_path=None, alpha=0.5, beta=1.0):
        """Change decoding strategy for speed vs accuracy tradeoff"""
        print("HHHHH11111")

        print("HHHHH222222")

        from omegaconf import DictConfig

        if strategy == 'greedy':
            # Fastest - use for real-time applications
            decoding_cfg = DictConfig({
                'strategy': 'greedy',
                'greedy': {
                    'max_symbols_per_step': 10,
                    'preserve_alignments': False,
                    'preserve_frame_confidence': False,
                    'loop_labels': True,
                    'use_cuda_graph_decoder': True
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        elif strategy == 'beam':
            # Standard beam search
            decoding_cfg = DictConfig({
                'strategy': 'beam',
                'beam': {
                    'beam_size': beam_size,
                    'search_type': 'default',
                    'score_norm': True,
                    'return_best_hypothesis': True,
                    'softmax_temperature': 1.0,
                    'preserve_alignments': False
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        elif strategy == 'knelm_beam':
            # KNELM Enhanced Beam Search
            decoding_cfg = DictConfig({
                'strategy': 'beam',
                'beam': {
                    'beam_size': beam_size,
                    'search_type': 'kenlm',  # Use KNELM search
                    'score_norm': True,
                    'return_best_hypothesis': True,
                    'softmax_temperature': 1.0,
                    'preserve_alignments': False,
                    'lm_path': lm_path or self.lm_path,  # Path to language model
                    'lm_alpha': alpha,  # Language model weight
                    'lm_beta': beta,  # Word insertion penalty
                    'use_knelm': True,
                    'knelm_k': 10,  # Number of nearest neighbors
                    'knelm_lambda': 0.1  # KNELM interpolation weight
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        elif strategy == 'flashlight_beam':
            # Flashlight beam search with external LM
            decoding_cfg = DictConfig({
                'strategy': 'beam',
                'beam': {
                    'beam_size': beam_size,
                    'search_type': 'flashlight',
                    'flashlight_cfg': {
                        'lexicon_path': None,  # Path to lexicon file
                        'lm_path': lm_path or self.lm_path,  # Path to KenLM binary
                        'lm_weight': alpha,
                        'word_score': beta,
                        'unk_score': -float('inf'),
                        'sil_score': 0.0,
                        'log_add': False,
                        'criterion_type': 'ctc'
                    },
                    'return_best_hypothesis': True,
                    'preserve_alignments': False
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        elif strategy == 'maes':
            # Your original strategy
            decoding_cfg = DictConfig({
                'strategy': 'maes',
                'maes': {
                    'return_best_hypothesis': True
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })

        try:

            print("*******************")
            print(decoding_cfg)

            # Apply the configuration
            self.model.change_decoding_strategy(decoding_cfg)

            self.decoding_strategy = strategy
            self.beam_size = beam_size
            logger.info(f"Changed decoding strategy to: {strategy}")
            if lm_path:
                self.lm_path = lm_path
                logger.info(f"Using language model: {lm_path}")
        except Exception as e:
            traceback.print_exc()
            logger.error(f"Failed to change decoding strategy: {e}")

    def load_binary_lm(self, binary_path):
        """Load a binary language model file (KenLM format)"""
        try:
            if not os.path.exists(binary_path):
                raise FileNotFoundError(f"Binary LM file not found: {binary_path}")

            self.lm_path = binary_path
            logger.info(f"Binary language model loaded: {binary_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load binary LM: {e}")
            return False

    def initialize_model(self):
        """Initialize the NeMo ASR model"""
        logger.info("Initializing NeMo ASR model...")

        try:
            # Load your custom NeMo model
            if self.model_path.endswith('.ckpt'):
                self.model = nemo_asr.models.ASRModel.load_from_checkpoint("")
            else:
                self.model = nemo_asr.models.ASRModel.restore_from(self.model_path)

            logger.info("Model loaded successfully")

            # Use half precision for faster inference
            self.model = self.model.half()

            # Get vocabulary info
            if hasattr(self.model, 'tokenizer'):
                vocab_size = len(self.model.tokenizer.vocab)
                logger.info(f"Vocabulary size: {vocab_size}")

            # Set initial decoding strategy
            self.set_decoding_strategy(self.decoding_strategy, self.beam_size)

            self.initialized = True
            logger.info("Model initialization complete")
            logger.info(f"Using decoding strategy: {self.decoding_strategy}")

        except Exception as e:
            logger.error(f"Failed to initialize model: {str(e)}")
            self.initialized = False
            raise e

    def transcribe_audio(self, audio_path):
        """Transcribe audio file using the loaded model"""
        if not self.initialized:
            raise RuntimeError("Model not initialized")

        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        try:
            start_time = time.time()

            # Process the file with NeMo
            with torch.no_grad():
                transcription = self.model.transcribe([audio_path], batch_size=1)

            processing_time = time.time() - start_time

            # Get audio duration for RTF calculation
            try:
                audio_duration = librosa.get_duration(filename=audio_path)
                rtf = processing_time / audio_duration if audio_duration > 0 else 0
            except:
                audio_duration = 0
                rtf = 0

            # Extract and post-process transcription text
            text_result = self._extract_text_from_result(transcription)
            text_result = self._post_process_text(text_result)

            return {
                'text': str(text_result),
                'processing_time': float(round(processing_time, 3)),
                'audio_duration': float(round(audio_duration, 3)),
                'rtf': float(round(rtf, 3)),
                'decoding_strategy': self.decoding_strategy,
                'beam_size': self.beam_size if self.decoding_strategy in ['beam', 'knelm_beam',
                                                                          'flashlight_beam'] else None
            }

        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            raise e

    def _post_process_text(self, text):
        """Post-process text to handle special characters"""
        replacements = {
            "aw": "å", "ae": "ä", "oe": "ö",
            "AW": "Å", "AE": "Ä", "OE": "Ö",
            "⁇": ""
        }

        for old, new in replacements.items():
            text = text.replace(old, new)

        return text

    def _extract_text_from_result(self, transcription):
        """Extract text from NeMo transcription result"""
        try:
            if isinstance(transcription, list):
                if len(transcription) > 0:
                    result = transcription[0]
                    if hasattr(result, 'item'):
                        return str(result.item())
                    elif hasattr(result, 'text'):
                        return str(result.text)
                    else:
                        return str(result)
                else:
                    return ""
            elif isinstance(transcription, torch.Tensor):
                return str(transcription.item()) if transcription.numel() == 1 else str(transcription.tolist())
            elif hasattr(transcription, 'text'):
                return str(transcription.text)
            else:
                return str(transcription)
        except Exception as e:
            logger.warning(f"Text extraction fallback: {str(e)}")
            return str(transcription)

    def get_model_info(self):
        """Return detailed model information"""
        info = {
            'model_name': self.model_name,
            'model_type': type(self.model).__name__,
            'decoding_strategy': self.decoding_strategy,
            'beam_size': self.beam_size,
            'initialized': self.initialized,
            'lm_path': self.lm_path,
            'supported_strategies': ['greedy', 'beam', 'knelm_beam', 'flashlight_beam', 'maes']
        }

        try:
            if hasattr(self.model, 'cfg'):
                cfg = self.model.cfg
                info.update({
                    'architecture': cfg.get('_target_', 'Unknown'),
                    'vocab_size': len(self.model.tokenizer.vocab) if hasattr(self.model, 'tokenizer') else 'Unknown',
                    'sample_rate': cfg.get('preprocessor', {}).get('sample_rate', 'Unknown'),
                    'encoder_layers': cfg.get('encoder', {}).get('n_layers', 'Unknown'),
                    'decoder_layers': cfg.get('decoder', {}).get('num_layers', 'Unknown')
                })
        except:
            pass

        return info


# Initialize the model
MODEL_PATH = '/Users/harsol/Carasent/GIT/medsum-stream/experiment/models/parakeet/Speech_To_Text_Finetuning.nemo'
LM_PATH = "/Users/harsol/Carasent/GIT/medsum-stream/parakeet/model/parakeet-rnnt-1.1b_lm-o6.arpa.tmp.arpa"  # Path to your binary language model file

asr_model = NeMoASRModel(MODEL_PATH, decoding_strategy='knelm_beam', beam_size=50, lm_path=LM_PATH)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def convert_audio_to_wav(input_path, output_path):
    """Convert audio file to WAV format if needed"""
    try:
        audio, sr = librosa.load(input_path, sr=16000, mono=True)
        sf.write(output_path, audio, sr)
        return True
    except Exception as e:
        logger.error(f"Audio conversion failed: {str(e)}")
        return False


@app.route('/')
def index():
    return app.send_static_file('index.html')



@app.route('/load_lm', methods=['POST'])
def load_lm():
    """Load a binary language model file"""
    try:
        data = request.get_json()
        lm_path = data.get('lm_path')

        if not lm_path:
            return jsonify({'error': 'No language model path provided'}), 400

        if asr_model.load_binary_lm(lm_path):
            return jsonify({
                'status': 'success',
                'message': f'Language model loaded: {lm_path}',
                'lm_path': lm_path
            })
        else:
            return jsonify({'error': 'Failed to load language model'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/set_decoding', methods=['POST'])
def set_decoding():
    """Change decoding strategy"""
    try:
        data = request.get_json()
        strategy = data.get('strategy', 'beam')
        beam_size = data.get('beam_size', 4)
        lm_path = data.get('lm_path')
        alpha = data.get('alpha', 0.5)  # LM weight
        beta = data.get('beta', 1.0)  # Word insertion penalty

        valid_strategies = ['greedy', 'beam', 'knelm_beam', 'flashlight_beam', 'maes']
        if strategy not in valid_strategies:
            return jsonify({'error': f'Invalid strategy. Use one of: {valid_strategies}'}), 400

        asr_model.set_decoding_strategy(strategy, beam_size, lm_path, alpha, beta)

        return jsonify({
            'status': 'success',
            'strategy': strategy,
            'beam_size': beam_size if strategy in ['beam', 'knelm_beam', 'flashlight_beam'] else None,
            'lm_path': lm_path,
            'alpha': alpha if strategy in ['knelm_beam', 'flashlight_beam'] else None,
            'beta': beta if strategy in ['knelm_beam', 'flashlight_beam'] else None,
            'message': f'Decoding strategy changed to {strategy}'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/model_info', methods=['GET'])
def model_info():
    """Get detailed model information"""
    try:
        return jsonify(asr_model.get_model_info())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_initialized': asr_model.initialized,
        'model_name': asr_model.model_name,
        'decoding_strategy': asr_model.decoding_strategy,
        'beam_size': asr_model.beam_size,
        'lm_loaded': asr_model.lm_path is not None
    })

def transcribe_audio_with_strategies(audio_path):
    """
    Returns transcription for both:
    - Greedy decoding (no LM)
    - Flashlight beam search with strong LM
    """
    if not asr_model.initialized:
        raise RuntimeError("Model not initialized")
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # -- Greedy Decoding --
    asr_model.set_decoding_strategy('greedy')
    greedy_result = asr_model.transcribe_audio(audio_path)
    print(f"[GREEDY] {greedy_result['text']}")

    # -- Flashlight Beam with strong LM --
    # Increase LM alpha for heavy weightage (try 3.0, 4.0 or higher if needed)
    LM_PATH = asr_model.lm_path or "/Users/harsol/Carasent/GIT/medsum-stream/parakeet/model/kenlm-medical-h-encoded.binary"
    asr_model.set_decoding_strategy(
        strategy='flashlight_beam',
        beam_size=100,
        lm_path=LM_PATH,
        alpha=4.0,    # LM weight
        beta=1.0      # Word insertion penalty
    )
    beam_result = asr_model.transcribe_audio(audio_path)
    print(f"[FLASHLIGHT-BEAM-LM] {beam_result['text']}")

    return {
        'greedy_text': greedy_result['text'],
        'beam_lm_text': beam_result['text'],
        'processing_time_greedy': greedy_result['processing_time'],
        'processing_time_beam_lm': beam_result['processing_time'],
        'audio_duration': greedy_result['audio_duration'],
        'rtf_greedy': greedy_result['rtf'],
        'rtf_beam_lm': beam_result['rtf'],
    }


@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type.'}), 400

        # Save file
        filename = secure_filename(file.filename)
        timestamp = str(int(time.time()))
        filename = f"{timestamp}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        # Convert to WAV if needed
        wav_path = file_path
        if not filename.lower().endswith('.wav'):
            wav_filename = filename.rsplit('.', 1)[0] + '.wav'
            wav_path = os.path.join(app.config['UPLOAD_FOLDER'], wav_filename)
            if not convert_audio_to_wav(file_path, wav_path):
                return jsonify({'error': 'Failed to convert audio file'}), 500

        # -- The new logic here:
        results = transcribe_audio_with_strategies(wav_path)

        # Clean up files
        try:
            os.remove(file_path)
            if wav_path != file_path:
                os.remove(wav_path)
        except Exception as e:
            logger.warning(f"Cleanup failed: {str(e)}")

        return jsonify(results)

    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        return jsonify({'error': str(e)}), 500



if __name__ == '__main__':
    static_folder = 'static'
    os.makedirs(static_folder, exist_ok=True)

    print("=== Enhanced NeMo ASR Server ===")
    print(f"Model initialized: {asr_model.initialized}")
    print(f"Supported decoding strategies: {asr_model.get_model_info()['supported_strategies']}")
    print("Place your index.html file in the 'static' folder")
    print("Server starting on http://localhost:5009")

    app.run(host='0.0.0.0', port=5009, debug=True)