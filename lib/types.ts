export type GradDegreeType = 'Masters' | 'MBA' | 'PhD';

export type Profile = {
  id: string;
  full_name: string;
  headline: string | null;
  employer: string | null;
  title: string | null;
  undergrad_school: string | null;
  undergrad_year: string | null;
  grad_degree_type: GradDegreeType | null;
  grad_school: string | null;
  grad_year: string | null;
  photo_url: string | null;
  bio: string | null;
  linkedin_verified: boolean;
  linkedin_url: string | null;
  created_at: string;
};

export type NearbyUser = {
  id: string;
  full_name: string | null;
  headline: string | null;
  employer: string | null;
  title: string | null;
  undergrad_school: string | null;
  undergrad_year: string | null;
  grad_degree_type: GradDegreeType | null;
  grad_school: string | null;
  grad_year: string | null;
  photo_url: string | null;
  distance_meters: number;
};

export type RequestType = 'connect' | 'coffee';
export type RequestStatus = 'pending' | 'accepted' | 'declined';

export type ConnectionRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  type: RequestType;
  message: string | null;
  status: RequestStatus;
  meeting_location: string | null;
  meeting_at: string | null;
  context_type: 'nearby' | 'event';
  event_id: string | null;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
};

export type Connection = {
  id: string;
  user_a: string;
  user_b: string;
  connected_at: string;
  other?: Profile;
};
