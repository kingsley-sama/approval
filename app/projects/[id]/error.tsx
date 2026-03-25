'use client';

import React from 'react';

interface ProjectErrorProps {
    error: Error;
}

export default function ProjectError({ error }: ProjectErrorProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full p-4">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-2">{error.message}</p>
            <p className="text-gray-500 text-sm">Please try refreshing the page or contact support if the issue persists.</p>
        </div>
    );
}