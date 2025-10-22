"use client";
import { useState } from "react";

interface BreakModalProps {
  onSubmit: (breakType: string, note?: string) => void;
  onClose: () => void;
}

export default function BreakModal({ onSubmit, onClose }: BreakModalProps) {
  const [selectedBreak, setSelectedBreak] = useState("");
  const [notes, setNotes] = useState<{ [key: string]: string }>({});

  // Break groups
  const nonWorkRelated = ["Meal break", "Out of Office", "Toilet"];
  const workRelated = ["Meeting", "Training", "Office leave", "Called by HR", "Other"];

  const showInput = (type: string) =>
    (nonWorkRelated.includes(type) && type !== "Toilet") || workRelated.includes(type);

  const handleSubmit = () => {
    if (!selectedBreak) return;
    onSubmit(selectedBreak, notes[selectedBreak] || "");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Blurred background */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-xl w-11/12 max-w-4xl">
        {/* Title */}
        <div className="flex items-center justify-start mb-4 border-b border-gray-300 dark:border-gray-600 pb-2">
          <h2 className="text-2xl font-bold">Type of break</h2>
        </div>

        {/* Columns */}
        <div className="flex gap-6">
          {/* Non-work related */}
          <div className="flex-1">
            <h3 className="font-semibold mb-3 text-left">Non-work related</h3>
            <div className="flex flex-col space-y-3">
              {nonWorkRelated.map((type) => (
                <div key={type} className="flex flex-col">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="breakType"
                      value={type}
                      checked={selectedBreak === type}
                      onChange={() => setSelectedBreak(type)}
                    />
                    <span>{type}</span>
                  </label>
                  {selectedBreak === type && showInput(type) && (
                    <input
                      type="text"
                      placeholder={type === "Meal break" ? "e.g., Lunch, Dinner" : "Add a note..."}
                      value={notes[type] || ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [type]: e.target.value }))
                      }
                      className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Work related */}
          <div className="flex-1">
            <h3 className="font-semibold mb-3 text-left">Work related</h3>
            <div className="flex flex-col space-y-3">
              {workRelated.map((type) => (
                <div key={type} className="flex flex-col">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="breakType"
                      value={type}
                      checked={selectedBreak === type}
                      onChange={() => setSelectedBreak(type)}
                    />
                    <span>{type}</span>
                  </label>
                  {selectedBreak === type && showInput(type) && (
                    <input
                      type="text"
                      placeholder="Add a note..."
                      value={notes[type] || ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [type]: e.target.value }))
                      }
                      className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
