import { Dispatch, SetStateAction } from "react";
import { Group, UserType } from "@/types";

interface Props {
  groups: Group[];
  onSelectGroup: (g: Group) => void;
  onOpenAddMember: (group: Group) => void;
  onShowAddMemberModal: (show: boolean) => void;
  onShowCreateGroupModal: (show: boolean) => void;
}

export default function GroupList({
  groups,
  onSelectGroup,
  onOpenAddMember,
  onShowAddMemberModal,
  onShowCreateGroupModal,
}: Props) {
  return (
    <div className="mt-6">
      <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-200">
        Groups
      </h3>
      <button
        onClick={() => onShowCreateGroupModal(true)}
        className="text-sm bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
      >
        + Create
      </button>
      <div className="space-y-2">
        {groups.map((g) => (
          <div
            key={g.id}
            className="flex items-center justify-between w-full px-3 py-2 rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <button
              className="flex items-center space-x-2 flex-1"
              onClick={() => onSelectGroup(g)}
            >
              <img
                src={g.avatar || `https://avatars.dicebear.com/api/identicon/${g.id}.svg`}
                alt={g.name}
                className="w-8 h-8 rounded-full"
              />
              <span className="font-medium">{g.name}</span>
            </button>

            <button
              className="text-sm bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
              onClick={() => {
                onOpenAddMember(g);
                onShowAddMemberModal(true);
              }}
            >
              + Member
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
