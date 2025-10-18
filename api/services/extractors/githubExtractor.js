/**
 * GitHub Data Extractor
 * Extracts commits, issues, PRs, comments, and code reviews from GitHub
 */

import { Octokit } from '@octokit/rest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class GitHubExtractor {
  constructor(accessToken) {
    this.octokit = new Octokit({ auth: accessToken });
    this.accessToken = accessToken;
  }

  /**
   * Main extraction method - extracts all GitHub data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[GitHub] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      // Get authenticated user info
      const { data: user } = await this.octokit.users.getAuthenticated();
      console.log(`[GitHub] Authenticated as: ${user.login}`);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractCommits(userId, user.login);
      totalItems += await this.extractIssues(userId, user.login);
      totalItems += await this.extractPullRequests(userId, user.login);
      totalItems += await this.extractCodeReviews(userId, user.login);
      totalItems += await this.extractRepositories(userId, user.login);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[GitHub] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[GitHub] Extraction error:', error);
      throw error;
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
          // Get commits from this repo
          const commits = await this.octokit.paginate(
            this.octokit.repos.listCommits,
            {
              owner: repo.owner.login,
              repo: repo.name,
              author: username,
              per_page: 100
            },
            (response) => response.data.slice(0, 50) // Limit to 50 commits per repo
          );

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
      // Get issues created by or assigned to user
      const issues = await this.octokit.paginate(
        this.octokit.issues.listForAuthenticatedUser,
        {
          filter: 'all',
          state: 'all',
          per_page: 100
        },
        (response) => response.data.slice(0, 100) // Limit to 100 issues
      );

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
          const prs = await this.octokit.paginate(
            this.octokit.pulls.list,
            {
              owner: repo.owner.login,
              repo: repo.name,
              state: 'all',
              per_page: 100
            },
            (response) => response.data.slice(0, 30)
          );

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
          const prs = await this.octokit.paginate(
            this.octokit.pulls.list,
            {
              owner: repo.owner.login,
              repo: repo.name,
              state: 'all',
              per_page: 100
            },
            (response) => response.data.slice(0, 20)
          );

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

export default GitHubExtractor;
