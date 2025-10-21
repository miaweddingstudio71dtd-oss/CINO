/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Modality} from '@google/genai';

// Fix: Define and use AIStudio interface for window.aistudio to resolve type conflict.
// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    // This provides a fallback for environments where the dialog isn't available
    showStatusError(
      'Không thể chọn API key. Vui lòng cấu hình biến môi trường API_KEY.',
    );
  }
}

const statusEl = document.querySelector('#status') as HTMLDivElement;

async function restoreImage(
  base64ImageData: string,
  mimeType: string,
  apiKey: string,
  level: number,
): Promise<string> {
  const ai = new GoogleGenAI({apiKey});

  const RESTORATION_PROMPT = `Phục chế lại bức ảnh chân dung cũ này theo các yêu cầu sau:

1. **Giữ nguyên đặc điểm khuôn mặt và chi tiết gốc của nhân vật** – không thay đổi tỉ lệ khuôn mặt, dáng người hoặc trang phục.
2. **Khôi phục độ nét và chi tiết tự nhiên** ở mắt, miệng, tóc, tay và nền ảnh — tránh làm da quá mịn hoặc trông giả.
3. **Loại bỏ các vết nứt, bụi, ố vàng và nhiễu hạt** trên bức ảnh cũ.
4. **Tái tạo ánh sáng và tông màu tự nhiên như thật** – đảm bảo ánh sáng mềm mại, màu da hài hòa, không bệt màu, và giữ được cảm giác chân thực.
5. Nếu ảnh bị mờ hoặc thiếu nét, **hãy tái tạo chi tiết hợp lý** để khuôn mặt rõ ràng nhưng vẫn chân thực, không biến dạng.
6. Nếu ảnh có nhiều vùng hư hại, **hãy suy luận hợp lý để điền vào** mà không thay đổi bố cục tổng thể.

Kết quả cuối cùng phải có **chất lượng 4K sắc nét**, mang lại cảm giác **ảnh thật – chân thực – cảm xúc**, như một bức ảnh được chụp rõ nét nguyên bản chứ không phải ảnh AI tái tạo. Áp dụng mức độ phục chế là ${level}%.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64ImageData,
            mimeType: mimeType,
          },
        },
        {
          text: RESTORATION_PROMPT,
        },
      ],
    },
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64ImageBytes: string = part.inlineData.data;
      return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
    }
  }

  throw new Error(
    'Không có ảnh nào được phục chế. Yêu cầu có thể đã bị chặn.',
  );
}

// --- DOM Element Selection ---
const uploadArea = document.querySelector('#upload-area') as HTMLDivElement;
const fileInput = document.querySelector('#file-input') as HTMLInputElement;
const originalImage = document.querySelector(
  '#original-image',
) as HTMLImageElement;
const restoredImage = document.querySelector(
  '#restored-image',
) as HTMLImageElement;
const restoreButton = document.querySelector(
  '#restore-button',
) as HTMLButtonElement;
const downloadButton = document.querySelector(
  '#download-button',
) as HTMLButtonElement;
const restoredImageContainer = document.querySelector(
  '#restored-image-container',
) as HTMLDivElement;
const uploadPlaceholder = document.querySelector(
  '#upload-placeholder',
) as HTMLDivElement;
const restoredPlaceholder = document.querySelector(
  '#restored-placeholder',
) as HTMLDivElement;
const loadingSpinner = document.querySelector(
  '#loading-spinner',
) as HTMLDivElement;
const restorationLevelSlider = document.querySelector(
  '#restoration-level',
) as HTMLInputElement;
const sliderValueEl = document.querySelector(
  '#slider-value',
) as HTMLSpanElement;

// --- State Variables ---
let selectedFile: {
  base64: string;
  mimeType: string;
} | null = null;

// --- Event Listeners ---
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    handleFile(files[0]);
  }
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
  uploadArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

uploadArea.addEventListener('dragenter', () =>
  uploadArea.classList.add('bg-[#353739]'),
);
uploadArea.addEventListener('dragleave', () =>
  uploadArea.classList.remove('bg-[#353739]'),
);
uploadArea.addEventListener('drop', (e) => {
  uploadArea.classList.remove('bg-[#353739]');
  const dt = (e as DragEvent).dataTransfer;
  if (dt && dt.files && dt.files.length > 0) {
    handleFile(dt.files[0]);
  }
});

restoreButton.addEventListener('click', () => {
  if (!selectedFile) {
    showStatusError('Vui lòng tải ảnh lên để phục chế.');
    return;
  }
  restore();
});

downloadButton.addEventListener('click', () => {
  if (restoredImage.src) {
    const a = document.createElement('a');
    a.href = restoredImage.src;
    a.download = 'restored_image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
});

restorationLevelSlider.addEventListener('input', () => {
  sliderValueEl.textContent = restorationLevelSlider.value;
});

// --- Functions ---
function handleFile(file: File) {
  if (!file.type.startsWith('image/')) {
    showStatusError('Vui lòng tải lên một tệp ảnh hợp lệ.');
    return;
  }
  const reader = new FileReader();
  reader.onloadend = () => {
    const base64String = (reader.result as string).split(',')[1];
    selectedFile = {
      base64: base64String,
      mimeType: file.type,
    };

    originalImage.src = reader.result as string;
    uploadPlaceholder.classList.add('hidden');
    originalImage.classList.remove('hidden');
    uploadArea.classList.remove(
      'border-2',
      'border-dashed',
      'border-gray-600',
      'hover:border-gray-500',
    );

    restoreButton.disabled = false;
    restoredImage.classList.add('hidden');
    restoredPlaceholder.classList.remove('hidden');
    downloadButton.disabled = true;
    statusEl.innerText = 'Ảnh đã tải lên. Sẵn sàng để phục chế.';
  };
  reader.readAsDataURL(file);
}

function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

function setControlsDisabled(disabled: boolean) {
  restoreButton.disabled = disabled;
  fileInput.disabled = disabled;
  restorationLevelSlider.disabled = disabled;
  uploadArea.style.pointerEvents = disabled ? 'none' : 'auto';
}

async function restore() {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    showStatusError('API key chưa được cấu hình. Vui lòng thêm API key của bạn.');
    await openApiKeyDialog();
    return;
  }

  if (!selectedFile) {
    showStatusError('Không có tệp ảnh nào được chọn.');
    return;
  }

  statusEl.innerText = 'Đang phục chế ảnh... Quá trình này có thể mất một chút thời gian.';
  restoredImage.classList.add('hidden');
  restoredPlaceholder.classList.add('hidden');
  loadingSpinner.classList.remove('hidden');
  downloadButton.disabled = true;
  setControlsDisabled(true);

  try {
    const restorationLevel = parseInt(restorationLevelSlider.value, 10);
    const restoredImageUrl = await restoreImage(
      selectedFile.base64,
      selectedFile.mimeType,
      apiKey,
      restorationLevel,
    );
    restoredImage.src = restoredImageUrl;
    restoredImage.classList.remove('hidden');
    downloadButton.disabled = false;
    statusEl.innerText = 'Phục chế ảnh thành công.';
  } catch (e) {
    console.error('Lỗi phục chế ảnh:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'Đã xảy ra lỗi không xác định.';

    let userFriendlyMessage = `Lỗi: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          'Không tìm thấy model. Điều này có thể do API key không hợp lệ hoặc vấn đề về quyền. Vui lòng kiểm tra lại API key.';
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage = 'API key của bạn không hợp lệ. Vui lòng thêm một API key hợp lệ.';
        shouldOpenDialog = true;
      }
    }

    showStatusError(userFriendlyMessage);
    restoredPlaceholder.classList.remove('hidden');

    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    loadingSpinner.classList.add('hidden');
    setControlsDisabled(false);
  }
}