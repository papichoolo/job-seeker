'use client';

import { useState, KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

interface SkillCloudProps {
    skills: string[];
    onSkillsChange: (skills: string[]) => void;
}

export function SkillCloud({ skills, onSkillsChange }: SkillCloudProps) {
    const [newSkill, setNewSkill] = useState('');

    const handleRemoveSkill = (skillToRemove: string) => {
        onSkillsChange(skills.filter(skill => skill !== skillToRemove));
    };

    const handleAddSkill = () => {
        const trimmedSkill = newSkill.trim();
        if (trimmedSkill && !skills.includes(trimmedSkill)) {
            onSkillsChange([...skills, trimmedSkill]);
            setNewSkill('');
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddSkill();
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                Skills
            </h3>

            {/* Skill chips */}
            <div className="flex flex-wrap gap-2">
                {skills.map((skill, index) => (
                    <Badge
                        key={`${skill}-${index}`}
                        variant="secondary"
                        className="
              group px-3 py-1.5 text-sm font-medium
              bg-neutral-800 text-white border border-neutral-700
              hover:bg-neutral-700 hover:border-neutral-600
              transition-all duration-200 cursor-default
            "
                    >
                        {skill}
                        <button
                            onClick={() => handleRemoveSkill(skill)}
                            className="
                ml-2 opacity-60 hover:opacity-100 transition-opacity
                focus:outline-none focus:ring-2 focus:ring-white/20 rounded-full
              "
                            aria-label={`Remove ${skill}`}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </Badge>
                ))}
            </div>

            {/* Add skill input */}
            <div className="flex gap-2">
                <Input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a skill..."
                    className="
            flex-1 bg-neutral-900 border-neutral-700 text-white
            placeholder:text-neutral-500
            focus:border-neutral-500 focus:ring-neutral-500
          "
                />
                <button
                    onClick={handleAddSkill}
                    disabled={!newSkill.trim()}
                    className="
            px-4 py-2 rounded-md bg-neutral-800 border border-neutral-700
            text-white font-medium
            hover:bg-neutral-700 hover:border-neutral-600
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200
          "
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
