import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostizCloudService } from '@gitroom/nestjs-libraries/integrations/postiz.cloud.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class IntegrationListTool implements AgentToolInterface {
  constructor(
    private _integrationService: IntegrationService,
    private _postizCloudService: PostizCloudService
  ) {}
  name = 'integrationList';

  run() {
    return createTool({
      id: 'integrationList',
      description: `This tool list available integrations to schedule posts to. Optionally pass a group id (from the groupList tool) to only list integrations belonging to that group`,
      inputSchema: z.object({
        group: z
          .string()
          .optional()
          .describe(
            'Optional group (customer) id from the groupList tool to filter the integrations'
          ),
      }),
      mcp: {
        annotations: {
          title: 'List Integrations',
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
            picture: z.string(),
            platform: z.string(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const [localIntegrations, cloudIntegrations] = await Promise.all([
          this._integrationService.getIntegrationsList(organizationId),
          this._postizCloudService.listIntegrations(),
        ]);

        return {
          output: [
            ...localIntegrations
              .filter(
                (integration) =>
                  !this._postizCloudService.enabled ||
                  integration.providerIdentifier === 'sanity'
              )
              .map((integration) => ({
                ...integration,
                platform: integration.providerIdentifier,
              })),
            ...cloudIntegrations.map((integration) => ({
              ...integration,
              platform: integration.identifier,
            })),
          ]
            .filter(
              (p) => !inputData.group || p.customer?.id === inputData.group
            )
            .map((p) => ({
              name: p.name,
              id: p.id,
              disabled: p.disabled,
              picture: p.picture || '/no-picture.jpg',
              platform: p.platform,
              display: p.profile,
              type: 'type' in p ? p.type : 'social',
              customer: p.customer
                ? {
                    id: p.customer.id,
                    name: p.customer.name,
                  }
                : undefined,
            })),
        };
      },
    });
  }
}
