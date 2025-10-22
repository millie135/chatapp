// components/common/SuccessModal.tsx
"use client";
import React from "react";

interface Props {
  message: string;
  onClose: () => void;
}

const SuccessModal: React.FC<Props> = ({ message, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center relative shadow-lg">
        <button
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="text-2xl font-bold mb-4">{message}</h2>
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SuccessModal;
