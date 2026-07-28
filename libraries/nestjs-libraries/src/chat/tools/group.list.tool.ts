import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostizCloudService } from '@gitroom/nestjs-libraries/integrations/postiz.cloud.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class GroupListTool implements AgentToolInterface {
  constructor(
    private _integrationService: IntegrationService,
    private _postizCloudService: PostizCloudService
  ) {}
  name = 'groupList';

  run() {
    return createTool({
      id: 'groupList',
      description: `This tool lists the available groups (customers). Use a group id with the integrationList tool to filter the integrations belonging to that group`,
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          title: 'List Groups',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        if (!this._postizCloudService.enabled) {
          return {
            output: (
              await this._integrationService.customers(organizationId)
            ).map((p) => ({
              id: p.id,
              name: p.name,
            })),
          };
        }

        const [localIntegrations, cloudIntegrations] = await Promise.all([
          this._integrationService.getIntegrationsList(organizationId),
          this._postizCloudService.listIntegrations(),
        ]);
        const groups = [
          ...localIntegrations
            .filter(
              (integration) => integration.providerIdentifier === 'sanity'
            )
            .map((integration) => integration.customer),
          ...cloudIntegrations.map((integration) => integration.customer),
        ].filter((group): group is { id: string; name: string } =>
          Boolean(group)
        );

        return {
          output: Array.from(
            new Map(groups.map((group) => [group.id, group])).values()
          ),
        };
      },
    });
  }
}
