"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onSubmit: (groupName: string, avatar: string) => void;
}

export default function CreateGroupModal({ onClose, onSubmit }: Props) {
  const [groupName, setGroupName] = useState("");
  const [avatar, setAvatar] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    onSubmit(groupName.trim(), avatar.trim() || `https://avatars.dicebear.com/api/identicon/${groupName}.svg`);
    setGroupName("");
    setAvatar("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Darker blur overlay like ManageMembersSidebar */}
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={onClose} // clicking outside closes the modal
      />

      {/* Modal content */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-96 z-10">
        <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">
          Create New Group
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Group Name */}
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              className="w-full p-2 border rounded text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700"
              required
            />
          </div>

          {/* Avatar URL */}
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">Avatar URL (optional)</label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="Enter avatar URL or leave blank"
              className="w-full p-2 border rounded text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );

}
