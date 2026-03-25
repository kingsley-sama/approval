// not found page for project


export default function ProjectNotFound() {
    return (
        <div className="flex flex-col items-center justify-center h-full p-4">
            <h1 className="text-2xl font-bold mb-4">Project not found</h1>
            <p className="text-gray-600 mb-2">The project you are looking for does not exist.</p>
            <p className="text-gray-500 text-sm">Please check the URL or contact support if you believe this is an error.</p>
        </div>
    );
}
