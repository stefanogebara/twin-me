/**
 * GitHub Data Extractor
 * Extracts repositories, commits, pull requests, issues, and code reviews
 * to build a technical soul signature
 */

import { createClient } from '@supabase/supabase-js';
import { GithubTokenManager } from '../tokenManagers/githubTokenManager.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class GithubExtractor {
  constructor(userId, platform = 'github') {
    this.userId = userId;
    this.platform = platform;
    this.baseUrl = 'https://api.github.com';
  }

  /**
   * Main extraction method - extracts all GitHub data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[GitHub] Starting full extraction for user: ${userId}`);

    let job = null;
    try {
      // Create extraction job
      job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractProfile(userId);
      totalItems += await this.extractRepositories(userId);

      // Get username for subsequent API calls
      const username = await this.getUsername(userId);
      if (username) {
        totalItems += await this.extractPullRequests(userId, username);
        totalItems += await this.extractIssues(userId, username);
        totalItems += await this.extractEvents(userId, username);
      }

      // Analyze technical profile from extracted data
      let analysis = null;
      try {
        console.log(`[GitHub] Analyzing technical profile...`);
        analysis = await this.analyzeTechnicalProfile(userId);
        console.log(`[GitHub] Technical profile analysis complete`);
      } catch (analysisError) {
        console.error('[GitHub] Error analyzing technical profile:', analysisError);
        // Don't fail the extraction if analysis fails
      }

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[GitHub] Extraction complete. Total items: ${totalItems}`);
      return {
        success: true,
        itemsExtracted: totalItems,
        platform: 'github',
        analysis: analysis
      };
    } catch (error) {
      console.error('[GitHub] Extraction error:', error);

      // Mark the job as failed if it was created
      if (job && job.id) {
        await this.failExtractionJob(job.id, error.message || 'Unknown error occurred');
      }

      // If 401, throw to trigger reauth flow
      if (error.status === 401 || error.message?.includes('401')) {
        const authError = new Error('GitHub authentication failed - please reconnect');
        authError.status = 401;
        throw authError;
      }

      throw error;
    }
  }

  /**
   * Make authenticated request to GitHub API with automatic token refresh
   */
  async makeRequest(endpoint, params = {}, retryCount = 0) {
    try {
      // Get valid access token
      const accessToken = await GithubTokenManager.getValidAccessToken(this.userId);

      const url = new URL(`${this.baseUrl}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      // Handle 401 with retry
      if (response.status === 401 && retryCount < 2) {
        console.log(`[GitHub] 401 error, retrying (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.makeRequest(endpoint, params, retryCount + 1);
      }

      // Handle rate limiting (403 with X-RateLimit-Remaining: 0)
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');

        if (rateLimitRemaining === '0' && rateLimitReset) {
          const resetTime = new Date(parseInt(rateLimitReset) * 1000);
          const waitTime = resetTime.getTime() - Date.now();
          console.warn(`[GitHub] Rate limit exceeded. Reset at ${resetTime.toISOString()}`);

          // If reset is within 5 minutes, wait. Otherwise, throw error
          if (waitTime > 0 && waitTime < 300000) {
            console.log(`[GitHub] Waiting ${Math.ceil(waitTime / 1000)}s for rate limit reset...`);
            await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
            return this.makeRequest(endpoint, params, retryCount);
          }
        }
      }

      if (!response.ok) {
        const error = await response.text();
        const apiError = new Error(`GitHub API error (${response.status}): ${error}`);
        apiError.status = response.status;
        throw apiError;
      }

      return response.json();
    } catch (error) {
      if (error.message.includes('Token refresh failed') || error.message.includes('Not authenticated')) {
        console.error('[GitHub] Token refresh failed - marking connection as needs_reauth');
        const authError = new Error('GitHub authentication failed - please reconnect');
        authError.status = 401;
        throw authError;
      }
      throw error;
    }
  }

  /**
   * Extract user profile information
   */
  async extractProfile(userId) {
    console.log(`[GitHub] Extracting user profile...`);

    try {
      const profile = await this.makeRequest('/user');

      await this.storeRawData(userId, 'github', 'profile', {
        user_id: profile.id,
        login: profile.login,
        name: profile.name,
        email: profile.email,
        bio: profile.bio,
        company: profile.company,
        location: profile.location,
        blog: profile.blog,
        twitter_username: profile.twitter_username,
        public_repos: profile.public_repos,
        public_gists: profile.public_gists,
        followers: profile.followers,
        following: profile.following,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        avatar_url: profile.avatar_url,
        hireable: profile.hireable,
        url: profile.html_url
      });

      console.log(`[GitHub] Extracted profile for ${profile.login}`);
      return 1;
    } catch (error) {
      console.error('[GitHub] Error extracting profile:', error);
      return 0;
    }
  }

  /**
   * Extract user commits from all repositories
   */
  async extractCommits(userId, username) {
    console.log(`[GitHub] Extracting commits...`);
    let commitCount = 0;

    try {
      // Get all repos (including contributed ones)
      const repos = await this.octokit.paginate(
        this.octokit.repos.listForAuthenticatedUser,
        { per_page: 100, affiliation: 'owner,collaborator' }
      );

      console.log(`[GitHub] Found ${repos.length} repositories`);

      for (const repo of repos.slice(0, 20)) { // Limit to 20 repos for initial version
        try {
          // Get commits from this repo (limit to 50 per repo)
          const allCommits = await this.octokit.paginate(
            this.octokit.repos.listCommits,
            {
              owner: repo.owner.login,
              repo: repo.name,
              author: username,
              per_page: 100
            }
          );
          const commits = allCommits.slice(0, 50); // Limit to 50 commits per repo

          for (const commit of commits) {
            await this.storeRawData(userId, 'github', 'commit', {
              repo: repo.full_name,
              sha: commit.sha,
              message: commit.commit.message,
              author: commit.commit.author,
              committer: commit.commit.committer,
              timestamp: commit.commit.author.date,
              url: commit.html_url,
              additions: commit.stats?.additions,
              deletions: commit.stats?.deletions,
              total_changes: commit.stats?.total
            });

            commitCount++;
          }
        } catch (repoError) {
          console.warn(`[GitHub] Skipping repo ${repo.full_name}:`, repoError.message);
        }
      }

      console.log(`[GitHub] Extracted ${commitCount} commits`);
      return commitCount;
    } catch (error) {
      console.error('[GitHub] Error extracting commits:', error);
      return commitCount;
    }
  }

  /**
   * Extract issues and issue comments
   */
  async extractIssues(userId, username) {
    console.log(`[GitHub] Extracting issues and comments...`);
    let itemCount = 0;

    try {
      // Get issues created by or assigned to user (limit to 100 total)
      const allIssues = await this.octokit.paginate(
        this.octokit.issues.listForAuthenticatedUser,
        {
          filter: 'all',
          state: 'all',
          per_page: 100
        }
      );
      const issues = allIssues.slice(0, 100); // Limit to 100 issues

      for (const issue of issues) {
        // Skip pull requests (they have pull_request property)
        if (issue.pull_request) continue;

        // Store issue
        await this.storeRawData(userId, 'github', 'issue', {
          repo: issue.repository_url.split('/').slice(-2).join('/'),
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          url: issue.html_url,
          labels: issue.labels.map(l => l.name),
          assignees: issue.assignees.map(a => a.login)
        });

        itemCount++;

        // Get issue comments
        try {
          const comments = await this.octokit.paginate(
            this.octokit.issues.listComments,
            {
              owner: issue.repository_url.split('/').slice(-2)[0],
              repo: issue.repository_url.split('/').slice(-1)[0],
              issue_number: issue.number,
              per_page: 100
            }
          );

          for (const comment of comments) {
            if (comment.user.login === username) {
              await this.storeRawData(userId, 'github', 'issue_comment', {
                issue_number: issue.number,
                repo: issue.repository_url.split('/').slice(-2).join('/'),
                body: comment.body,
                created_at: comment.created_at,
                updated_at: comment.updated_at,
                url: comment.html_url
              });

              itemCount++;
            }
          }
        } catch (commentError) {
          console.warn(`[GitHub] Error fetching comments for issue #${issue.number}:`, commentError.message);
        }
      }

      console.log(`[GitHub] Extracted ${itemCount} issues and comments`);
      return itemCount;
    } catch (error) {
      console.error('[GitHub] Error extracting issues:', error);
      return itemCount;
    }
  }

  /**
   * Extract pull requests
   */
  async extractPullRequests(userId, username) {
    console.log(`[GitHub] Extracting pull requests...`);
    let prCount = 0;

    try {
      // Get repos
      const repos = await this.octokit.paginate(
        this.octokit.repos.listForAuthenticatedUser,
        { per_page: 100, affiliation: 'owner,collaborator' }
      );

      for (const repo of repos.slice(0, 20)) {
        try {
          // Get PRs for this repo (limit to 30 per repo)
          const allPrs = await this.octokit.paginate(
            this.octokit.pulls.list,
            {
              owner: repo.owner.login,
              repo: repo.name,
              state: 'all',
              per_page: 100
            }
          );
          const prs = allPrs.slice(0, 30); // Limit to 30 PRs per repo

          for (const pr of prs) {
            if (pr.user.login === username) {
              await this.storeRawData(userId, 'github', 'pull_request', {
                repo: repo.full_name,
                number: pr.number,
                title: pr.title,
                body: pr.body,
                state: pr.state,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                merged_at: pr.merged_at,
                url: pr.html_url,
                additions: pr.additions,
                deletions: pr.deletions,
                changed_files: pr.changed_files
              });

              prCount++;
            }
          }
        } catch (repoError) {
          console.warn(`[GitHub] Skipping PRs for ${repo.full_name}:`, repoError.message);
        }
      }

      console.log(`[GitHub] Extracted ${prCount} pull requests`);
      return prCount;
    } catch (error) {
      console.error('[GitHub] Error extracting PRs:', error);
      return prCount;
    }
  }

  /**
   * Extract code reviews
   */
  async extractCodeReviews(userId, username) {
    console.log(`[GitHub] Extracting code reviews...`);
    let reviewCount = 0;

    try {
      const repos = await this.octokit.paginate(
        this.octokit.repos.listForAuthenticatedUser,
        { per_page: 100, affiliation: 'owner,collaborator' }
      );

      for (const repo of repos.slice(0, 15)) {
        try {
          // Get PRs for review extraction (limit to 20 per repo)
          const allPrs = await this.octokit.paginate(
            this.octokit.pulls.list,
            {
              owner: repo.owner.login,
              repo: repo.name,
              state: 'all',
              per_page: 100
            }
          );
          const prs = allPrs.slice(0, 20); // Limit to 20 PRs per repo

          for (const pr of prs) {
            try {
              const reviews = await this.octokit.paginate(
                this.octokit.pulls.listReviews,
                {
                  owner: repo.owner.login,
                  repo: repo.name,
                  pull_number: pr.number
                }
              );

              for (const review of reviews) {
                if (review.user.login === username && review.body) {
                  await this.storeRawData(userId, 'github', 'code_review', {
                    repo: repo.full_name,
                    pr_number: pr.number,
                    body: review.body,
                    state: review.state,
                    submitted_at: review.submitted_at,
                    url: review.html_url
                  });

                  reviewCount++;
                }
              }
            } catch (reviewError) {
              // Reviews may not be accessible
            }
          }
        } catch (repoError) {
          console.warn(`[GitHub] Skipping reviews for ${repo.full_name}`);
        }
      }

      console.log(`[GitHub] Extracted ${reviewCount} code reviews`);
      return reviewCount;
    } catch (error) {
      console.error('[GitHub] Error extracting reviews:', error);
      return reviewCount;
    }
  }

  /**
   * Extract repository metadata
   */
  async extractRepositories(userId, username) {
    console.log(`[GitHub] Extracting repository metadata...`);
    let repoCount = 0;

    try {
      const repos = await this.octokit.paginate(
        this.octokit.repos.listForAuthenticatedUser,
        { per_page: 100, affiliation: 'owner' }
      );

      for (const repo of repos) {
        await this.storeRawData(userId, 'github', 'repository', {
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          language: repo.language,
          languages_url: repo.languages_url,
          topics: repo.topics,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          pushed_at: repo.pushed_at,
          size: repo.size,
          stargazers_count: repo.stargazers_count,
          watchers_count: repo.watchers_count,
          forks_count: repo.forks_count,
          open_issues_count: repo.open_issues_count,
          url: repo.html_url,
          homepage: repo.homepage,
          is_fork: repo.fork,
          is_private: repo.private
        });

        repoCount++;
      }

      console.log(`[GitHub] Extracted ${repoCount} repositories`);
      return repoCount;
    } catch (error) {
      console.error('[GitHub] Error extracting repositories:', error);
      return repoCount;
    }
  }

  /**
   * Store raw data in database
   */
  async storeRawData(userId, platform, dataType, rawData) {
    try {
      const { error } = await supabase
        .from('user_platform_data')
        .upsert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: rawData,
          source_url: rawData.url,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[GitHub] Error storing data:', error);
      }
    } catch (error) {
      console.error('[GitHub] Exception storing data:', error);
    }
  }

  /**
   * Create extraction job
   */
  async createExtractionJob(userId, connectorId) {
    const { data, error } = await supabase
      .from('data_extraction_jobs')
      .insert({
        user_id: userId,
        connector_id: connectorId,
        platform: 'github',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[GitHub] Error creating job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, totalItems) {
    await supabase
      .from('data_extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_items: totalItems,
        processed_items: totalItems,
        results: { message: 'Extraction completed successfully' }
      })
      .eq('id', jobId);
  }
}

export default GithubExtractor;
