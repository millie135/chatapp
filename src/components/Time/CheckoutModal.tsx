"use client";

import React from "react";

interface CheckoutModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ onCancel, onConfirm }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-11/12 max-w-lg p-8 flex flex-col items-center text-center relative animate-scaleIn">
        
        {/* Rounded X Icon */}
        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-red-100 dark:bg-red-200 mb-6">
          <span className="text-red-600 text-6xl font-bold">✕</span>
        </div>

        {/* Title */}
        <h2 className="text-4xl font-extrabold text-gray-700 dark:text-gray-100 mb-3">
          Are you sure?
        </h2>

        {/* Description */}
        <p className="text-gray-700 dark:text-gray-300 text-lg mb-8">
          You are sure that you want to check out.
        </p>

        {/* Buttons */}
        <div className="flex space-x-6">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 text-lg font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-3 rounded-xl bg-red-600 text-white hover:bg-red-700 text-lg font-medium transition"
          >
            Yes
          </button>
        </div>
      </div>

      {/* Animation */}
      <style jsx>{`
        .animate-scaleIn {
          transform: scale(0.8);
          opacity: 0;
          animation: scaleIn 0.2s forwards;
        }
        @keyframes scaleIn {
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default CheckoutModal;
