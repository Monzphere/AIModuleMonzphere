<?php declare(strict_types = 1);

namespace Modules\IAChrome\Actions;

use CController;
use CControllerResponseData;
use API;
use CUser;
use Exception;

class IAChrome extends CController {
    protected function init(): void {
        $this->disableCsrfValidation();
    }

    protected function checkPermissions(): bool {
        return $this->getUserType() >= USER_TYPE_ZABBIX_USER;
    }

    protected function checkInput(): bool {
        $fields = [
            'hostid' => 'required|db hosts.hostid',
            'triggerid' => 'required|db triggers.triggerid'
        ];

        $ret = $this->validateInput($fields);

        if (!$ret) {
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'error' => ['messages' => ['Invalid input parameters']]
            ]);
            exit();
        }

        return $ret;
    }

    private function getMonthEvents(int $hostid, int $triggerid, int $year, int $month): array {
        try {
            $start_date = mktime(0, 0, 0, $month, 1, $year);
            $end_date = mktime(23, 59, 59, $month + 1, 0, $year);

            return API::Event()->get([
                'output' => ['eventid', 'clock', 'r_eventid', 'value'],
                'selectAcknowledges' => ['clock', 'userid', 'message'],
                'objectids' => $triggerid,
                'hostids' => $hostid,
                'time_from' => $start_date,
                'time_till' => $end_date,
                'sortfield' => ['clock'],
                'sortorder' => 'DESC'
            ]);

        } catch (\Exception $e) {
            return [];
        }
    }

    private function analyzeMonthEvents(array $events): array {
        $total_problems = 0;
        $resolution_times = [];
        $ack_events = 0;
        $acks = [];
        $problem_events = [];

        foreach ($events as $event) {
            if ($event['value'] == TRIGGER_VALUE_TRUE) {
                $problem_events[] = $event;
                $total_problems++;
            }
        }

        foreach ($problem_events as $problem) {
            foreach ($events as $event) {
                if ($event['eventid'] == $problem['r_eventid']) {
                    $resolution_time = ($event['clock'] - $problem['clock']) / 3600;
                    $resolution_times[] = $resolution_time;
                    break;
                }
            }

            if (!empty($problem['acknowledges'])) {
                $ack_events++;
                foreach ($problem['acknowledges'] as $ack) {
                    try {
                        $users = API::User()->get([
                            'userids' => [$ack['userid']],
                            'output' => ['alias', 'name', 'surname']
                        ]);
                        
                        $username = 'System';
                        if (!empty($users)) {
                            $user = $users[0];
                            if (!empty($user['name']) || !empty($user['surname'])) {
                                $username = trim($user['name'] . ' ' . $user['surname']);
                            } else {
                                $username = $user['alias'];
                            }
                        }

                        $message = !empty($ack['message']) && trim($ack['message']) !== '' 
                            ? $ack['message'] 
                            : '[No comment] Event acknowledged';

                        $acks[] = [
                            'event_time' => $problem['clock'],
                            'ack_time' => $ack['clock'],
                            'username' => $username,
                            'message' => $message,
                            'has_message' => !empty($ack['message']) && trim($ack['message']) !== ''
                        ];

                    } catch (\Exception $e) {
                        continue;
                    }
                }
            }
        }

        $avg_resolution = !empty($resolution_times) ? array_sum($resolution_times) / count($resolution_times) : 0;
        $ack_percentage = $total_problems > 0 ? ($ack_events / $total_problems) * 100 : 0;

        return [
            'total_problems' => $total_problems,
            'avg_resolution_time' => round($avg_resolution, 2),
            'ack_events' => $ack_events,
            'ack_percentage' => round($ack_percentage, 2),
            'acks' => $acks
        ];
    }

    protected function doAction(): void {
        try {
            header('Content-Type: application/json');
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: POST');
            
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Invalid request method');
            }

            $hostid = (int)$this->getInput('hostid');
            $triggerid = (int)$this->getInput('triggerid');

            if (!$hostid || !$triggerid) {
                throw new Exception('Invalid hostid or triggerid');
            }

            try {
                $host = API::Host()->get([
                    'output' => ['name'],
                    'selectInterfaces' => ['ip'],
                    'hostids' => $hostid
                ]);

                if (empty($host)) {
                    throw new Exception("Host not found: $hostid");
                }

                $hostIp = '';
                if (!empty($host[0]['interfaces'])) {
                    foreach ($host[0]['interfaces'] as $interface) {
                        if (!empty($interface['ip'])) {
                            $hostIp = $interface['ip'];
                            break;
                        }
                    }
                }

                $trigger = API::Trigger()->get([
                    'output' => ['description'],
                    'selectItems' => ['itemid'],
                    'triggerids' => $triggerid
                ]);

                if (empty($trigger)) {
                    throw new Exception("Trigger not found: $triggerid");
                }

                $itemid = null;
                if (!empty($trigger[0]['items'])) {
                    $itemid = $trigger[0]['items'][0]['itemid'];
                }

                $current_date = time();
                $current_month = (int)date('n', $current_date);
                $current_year = (int)date('Y', $current_date);
                
                $prev_month = $current_month == 1 ? 12 : $current_month - 1;
                $prev_year = $current_month == 1 ? $current_year - 1 : $current_year;

                $current_events = $this->getMonthEvents($hostid, $triggerid, $current_year, $current_month);
                $prev_events = $this->getMonthEvents($hostid, $triggerid, $prev_year, $prev_month);

                $current_stats = $this->analyzeMonthEvents($current_events);
                $prev_stats = $this->analyzeMonthEvents($prev_events);

                $response = [
                    'success' => true,
                    'data' => [
                        'host' => $host[0]['name'],
                        'hostip' => $hostIp,
                        'trigger' => $trigger[0]['description'],
                        'itemid' => $itemid,
                        'current_month' => [
                            'period' => date('m/Y', $current_date),
                            'stats' => $current_stats
                        ],
                        'previous_month' => [
                            'period' => date('m/Y', mktime(0, 0, 0, $prev_month, 1, $prev_year)),
                            'stats' => $prev_stats
                        ]
                    ]
                ];

            } catch (\Exception $apiError) {
                throw new Exception('Failed to fetch data from Zabbix API: ' . $apiError->getMessage());
            }

        } catch (Exception $e) {
            $response = [
                'success' => false,
                'error' => [
                    'messages' => [$e->getMessage()]
                ]
            ];
        }

        if (!isset($response)) {
            $response = [
                'success' => false,
                'error' => [
                    'messages' => ['Unknown error occurred']
                ]
            ];
        }

        http_response_code(200);
        echo json_encode($response);
        exit();
    }
} 