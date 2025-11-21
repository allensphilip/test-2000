import traceback

from flask import Flask, request, jsonify, render_template
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
            lm_path = self.lm_path
            print(f"KenLM configured: {bool(lm_path)}")
            if lm_path:
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
        if not self.lm_path:
            raise ValueError("Language model path not set")
        with_lm_cfg = DictConfig({
            'strategy': 'beam',
            'beam': {
                'beam_size': 100,
                'beam_alpha': 1.0,
                'beam_beta': 1.0,
                'kenlm_path': self.lm_path,
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
        """Change decoding strategy; supports 'greedy', 'beam', and 'auto'"""
        from omegaconf import DictConfig

        if strategy == 'greedy':
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
            beam_cfg = {
                'beam_size': beam_size,
                'score_norm': True,
                'return_best_hypothesis': True,
                'preserve_alignments': False,
                'max_symbols_per_step': 10
            }
            if lm_path or self.lm_path:
                beam_cfg.update({
                    'kenlm_path': lm_path or self.lm_path,
                    'beam_alpha': alpha,
                    'beam_beta': beta
                })
            decoding_cfg = DictConfig({
                'strategy': 'beam',
                'beam': beam_cfg,
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        elif strategy == 'auto':
            # Do not change model decoder now; will be selected per-audio in transcribe
            self.decoding_strategy = 'auto'
            self.beam_size = beam_size
            logger.info("Auto decoding enabled; strategy will be chosen per-audio")
            return
        
        try:
            # Apply the configuration
            self.model.change_decoding_strategy(decoding_cfg)

            self.decoding_strategy = strategy
            self.beam_size = beam_size
            logger.info(f"Changed decoding strategy to: {strategy}")
            if lm_path:
                self.lm_path = lm_path
                logger.info(f"Using language model: {lm_path}")
        except Exception as e:
            logger.error(f"Failed to change decoding strategy: {e}")

    def _select_decoding_for_duration(self, duration_sec):
        """Heuristic: choose decoding based on utterance length"""
        # Short utterances benefit from slightly larger beam; long ones from greedy or small beam
        if duration_sec is None:
            return 'beam', max(self.beam_size, 4)
        if duration_sec < 5:
            return 'beam', max(self.beam_size, 8)
        if duration_sec < 15:
            return 'beam', max(self.beam_size, 6)
        # Very long: use greedy for speed and stability
        return 'greedy', 0

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
                self.model = nemo_asr.models.ASRModel.load_from_checkpoint(self.model_path)
            else:
                self.model = nemo_asr.models.ASRModel.restore_from(self.model_path)

            logger.info("Model loaded successfully")

            if torch.cuda.is_available():
                torch.backends.cudnn.benchmark = True
                torch.backends.cudnn.enabled = True

            # Use half precision for faster inference
            if torch.cuda.is_available():
                self.model = self.model.half()

            if hasattr(torch, 'compile') and torch.cuda.is_available():
                try:
                    self.model = torch.compile(self.model, mode="reduce-overhead")
                    logger.info("Model compiled with torch.compile")
                except Exception as e:
                    logger.warning(f"torch.compile failed: {e}")

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
            # Pre-measure duration and optionally adjust decoding strategy
            try:
                audio_duration = librosa.get_duration(filename=audio_path)
            except Exception:
                audio_duration = None

            if self.decoding_strategy == 'auto':
                chosen_strategy, chosen_beam = self._select_decoding_for_duration(audio_duration or 0)
                if chosen_strategy == 'beam':
                    self.set_decoding_strategy('beam', beam_size=chosen_beam)
                else:
                    self.set_decoding_strategy('greedy')

            if (audio_duration or 0) > 60:
                return self._transcribe_long_audio(audio_path, chunk_duration=30, overlap=2)

            start_time = time.time()

            # Process the file with NeMo
            with torch.inference_mode():
                use_amp = torch.cuda.is_available()
                with torch.cuda.amp.autocast(enabled=use_amp):
                    transcription = self.model.transcribe([audio_path], batch_size=1)

            processing_time = time.time() - start_time

            # Compute RTF
            try:
                duration_for_rtf = audio_duration if audio_duration is not None else librosa.get_duration(filename=audio_path)
                rtf = processing_time / duration_for_rtf if (duration_for_rtf and duration_for_rtf > 0) else 0
            except Exception:
                duration_for_rtf = 0
                rtf = 0

            # Extract and post-process transcription text
            text_result = self._extract_text_from_result(transcription)
            text_result = self._post_process_text(text_result)

            return {
                'text': str(text_result),
                'processing_time': float(round(processing_time, 3)),
                'audio_duration': float(round((duration_for_rtf or 0), 3)),
                'rtf': float(round(rtf, 3)),
                'decoding_strategy': self.decoding_strategy,
                'beam_size': self.beam_size if self.decoding_strategy in ['beam'] else None
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

    def _transcribe_chunk(self, chunk_path):
        with torch.inference_mode():
            use_amp = torch.cuda.is_available()
            with torch.cuda.amp.autocast(enabled=use_amp):
                result = self.model.transcribe([chunk_path], batch_size=1)
        text = self._extract_text_from_result(result)
        return self._post_process_text(text)

    def _merge_transcriptions(self, parts):
        lines = [p.strip() for p in parts if p and p.strip()]
        if not lines:
            return ""
        merged = []
        prev = ""
        for ln in lines:
            if prev and ln.startswith(prev[-5:]):
                merged.append(ln[len(prev[-5:]):])
            else:
                merged.append(ln)
            prev = ln
        return "\n".join(merged)

    def _transcribe_long_audio(self, audio_path, chunk_duration=30, overlap=2):
        data, sr = librosa.load(audio_path, sr=16000, mono=True)
        total = len(data)
        chunk_samples = int(chunk_duration * sr)
        overlap_samples = int(overlap * sr)
        stride = max(1, chunk_samples - overlap_samples)
        texts = []
        idx = 0
        while idx < total:
            end = min(idx + chunk_samples, total)
            chunk = data[idx:end]
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                sf.write(tmp.name, chunk, sr)
                t = self._transcribe_chunk(tmp.name)
                texts.append(t)
                try:
                    os.unlink(tmp.name)
                except Exception:
                    pass
            if end >= total:
                break
            idx += stride
        merged = self._merge_transcriptions(texts)
        duration = len(data) / sr
        return {
            'text': merged,
            'processing_time': None,
            'audio_duration': float(round(duration, 3)),
            'rtf': None,
            'decoding_strategy': self.decoding_strategy,
            'beam_size': self.beam_size if self.decoding_strategy in ['beam'] else None
        }

    def _extract_text_from_result(self, transcription):
        """Extract text from NeMo transcription result"""
        try:
            if isinstance(transcription, list):
                if len(transcription) == 0:
                    return ""
                # Join multiple segments/hypotheses into full text
                parts = []
                for r in transcription:
                    if hasattr(r, 'text'):
                        parts.append(str(r.text))
                    elif hasattr(r, 'item'):
                        parts.append(str(r.item()))
                    else:
                        parts.append(str(r))
                return "\n".join([p for p in parts if p])
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
            'model_path': self.model_path,
            'decoding_strategy': self.decoding_strategy,
            'beam_size': self.beam_size,
            'initialized': self.initialized,
            'lm_path': self.lm_path,
            'supported_strategies': ['greedy', 'beam', 'auto']
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
MODEL_PATH = '/opt/aitraining/models/nemo_experiments_med_2/Speech_To_Text_Finetuning/2025-09-19_14-06-09/checkpoints/Speech_To_Text_Finetuning.nemo'
LM_PATH = None

ENV_MODEL_PATH = os.environ.get('NEMO_MODEL_PATH')
ENV_LM_PATH = os.environ.get('KENLM_PATH')
if ENV_MODEL_PATH:
    MODEL_PATH = ENV_MODEL_PATH
if ENV_LM_PATH is not None:
    LM_PATH = ENV_LM_PATH

asr_model = NeMoASRModel(MODEL_PATH, decoding_strategy='beam', beam_size=4, lm_path=LM_PATH)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def convert_audio_to_wav(input_path, output_path):
    """Convert audio file to WAV format if needed"""
    try:
        data, orig_sr = sf.read(input_path, dtype='float32')
        if len(getattr(data, 'shape', [])) > 1:
            data = np.mean(data, axis=1)
        target_sr = 16000
        if orig_sr != target_sr:
            data = librosa.resample(data, orig_sr=orig_sr, target_sr=target_sr, res_type='kaiser_best')
        max_val = float(np.max(np.abs(data))) if hasattr(np, 'abs') else 0.0
        if max_val > 0:
            data = data / max_val * 0.95
        sf.write(output_path, data, target_sr, subtype='PCM_16')
        return True
    except Exception as e:
        logger.error(f"Audio conversion failed: {str(e)}")
        return False


@app.route('/')
def index():
    return render_template('index.html')



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
        alpha = data.get('alpha', 0.8)
        beta = data.get('beta', 1.2)

        valid_strategies = ['greedy', 'beam', 'auto']
        if strategy not in valid_strategies:
            return jsonify({'error': f'Invalid strategy. Use one of: {valid_strategies}'}), 400

        asr_model.set_decoding_strategy(strategy, beam_size, lm_path, alpha, beta)

        return jsonify({
            'status': 'success',
            'strategy': strategy,
            'beam_size': beam_size if strategy in ['beam'] else None,
            'lm_path': lm_path,
            'alpha': alpha if lm_path else None,
            'beta': beta if lm_path else None,
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
    def get_health_data():
        try:
            import psutil
            sysmem = psutil.virtual_memory()
            syscpu = psutil.cpu_percent(interval=None)
            proc = psutil.Process(os.getpid())
            rss = proc.memory_info().rss
        except Exception:
            sysmem = type('m', (), {'total': 0, 'available': 0, 'used': 0})()
            syscpu = 0.0
            rss = 0
        gpu = {}
        if torch.cuda.is_available():
            try:
                free, total = torch.cuda.mem_get_info()
                gpu = {'total_bytes': int(total), 'free_bytes': int(free), 'used_bytes': int(total - free)}
            except Exception:
                gpu = {}
        return {
            'status': 'healthy',
            'model_initialized': asr_model.initialized,
            'model_name': asr_model.model_name,
            'decoding_strategy': asr_model.decoding_strategy,
            'beam_size': asr_model.beam_size,
            'lm_loaded': asr_model.lm_path is not None,
            'system': {
                'cpu_percent': float(syscpu),
                'mem_total': int(getattr(sysmem, 'total', 0)),
                'mem_available': int(getattr(sysmem, 'available', 0)),
                'mem_used': int(getattr(sysmem, 'used', 0)),
                'process_rss': int(rss),
                'gpu': gpu
            }
        }
    return jsonify(get_health_data())

def transcribe_current(audio_path):
    if not asr_model.initialized:
        raise RuntimeError("Model not initialized")
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    return asr_model.transcribe_audio(audio_path)


@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        file = request.files.get('file') or request.files.get('audio')
        if file is None:
            if request.data:
                tmp = tempfile.NamedTemporaryFile(delete=False)
                tmp.write(request.data)
                tmp.flush()
                tmp.close()
                file = type('f', (), {'filename': 'raw', 'save': lambda p, src=tmp.name: open(p, 'wb').write(open(src, 'rb').read())})()
            else:
                return jsonify({'error': 'No file provided'}), 400
        if not getattr(file, 'filename', ''):
            return jsonify({'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type.'}), 400

        # Save file
        filename = secure_filename(getattr(file, 'filename', 'audio'))
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

        results = transcribe_current(wav_path)

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

@app.route('/api/transcribe', methods=['POST'])
def api_transcribe():
    return transcribe()

@app.route('/api/model-status', methods=['GET'])
def api_model_status():
    def get_health_dict():
        return health().get_json(silent=True)
    return jsonify({'health': get_health_dict(), 'model_info': asr_model.get_model_info()})

@app.route('/api/model-info', methods=['GET'])
def api_model_info():
    return model_info()

@app.route('/api/health', methods=['GET'])
def api_health():
    return health()

@app.route('/api/set-decoding', methods=['POST'])
def api_set_decoding():
    return set_decoding()



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7000, debug=True)