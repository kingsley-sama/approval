// loading page for project details
// shows a skeleton while the project details are being loaded

import React from 'react';

export default function ProjectLoading() {
    return (
        <div className="flex flex-col items-center justify-center h-full p-4">
            <div className="w-full max-w-2xl animate-pulse">
                <div className="h-6 bg-gray-300 rounded mb-4"></div>
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
            </div>
        </div>
    );
}