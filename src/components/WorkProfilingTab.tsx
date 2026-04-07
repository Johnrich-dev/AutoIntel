import { ClipboardCheck, ExternalLink, X } from 'lucide-react';

interface WorkProfilingTabProps {
  applicantId: string;
  workStyleScore?: number;
  onClose: () => void;
}

export function WorkProfilingTab({ workStyleScore, onClose }: WorkProfilingTabProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Tab Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Work Profiling</h3>
            <p className="text-sm text-gray-500">Personality and work style analysis</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Score Summary */}
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Profiling Score</p>
              <p className="text-2xl font-bold text-green-600">{workStyleScore || 0}%</p>
            </div>
          </div>
        </div>

        {/* Assessment Description */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">About This Assessment</h4>
          <p className="text-sm text-gray-600 leading-relaxed">
            Work profiling assesses personality traits, work style preferences, and behavioral tendencies 
            to determine compatibility with the role requirements and company culture. This helps identify 
            candidates who will thrive in the specific work environment.
          </p>
        </div>

        {/* Assessment Dimensions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Assessment Dimensions</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
              <span>Work style preferences and habits</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
              <span>Team collaboration and communication style</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
              <span>Problem-solving and decision-making approach</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
              <span>Leadership and management potential</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
              <span>Stress management and adaptability</span>
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <button className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
          <ExternalLink className="w-4 h-4" />
          <span className="text-sm font-medium">View Full Work Profiling</span>
        </button>
      </div>
    </div>
  );
}
