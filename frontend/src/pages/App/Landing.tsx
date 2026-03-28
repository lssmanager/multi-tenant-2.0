import { useLogto } from '@logto/react';
import { APP_ENV } from '../../env';

const Landing = () => {
  const { signIn } = useLogto();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-3 text-[#052490]">Civitas by Learn Social Studies</h1>
          <p className="text-xl text-[#031C44] mb-8">Simplifying Social Studies with Tech</p>
          <div className="flex justify-center">
            <button
              className="px-8 py-3 bg-[#2259F2] text-white rounded-lg hover:bg-[#052490] transition-colors text-lg font-semibold shadow-lg hover:shadow-xl"
              onClick={() => {
                signIn({
                  redirectUri: APP_ENV.app.redirectUri,
                });
              }}
            >
              Get Started
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
          <FeatureCard
            title="Retail"
            description="Access premium Social Studies content, join a community of learners, and track your progress"
          />
          <FeatureCard
            title="School"
            description="Manage your school, assign teachers and students, and deliver Social Studies courses at scale"
          />
        </div>

        <div className="text-center mt-12 text-gray-500">
          <p>{`© ${new Date().getFullYear()} Learn Social Studies. All rights reserved.`}</p>
        </div>
      </div>
    </div>
  );
};

interface FeatureCardProps {
  title: string;
  description: string;
}

const FeatureCard = ({ title, description }: FeatureCardProps) => (
  <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
    <h3 className="text-xl font-semibold mb-3 text-gray-800">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

export default Landing;
